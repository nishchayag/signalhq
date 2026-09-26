import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import { can } from "@/lib/permissions";
import { isValidObjectId } from "@/lib/objectId";
import { canAccessQuestion } from "@/lib/questionAccess";
import { effectiveReadSince } from "@/lib/readState";
import { withAiViewOne } from "@/lib/messageView";
import { MESSAGE_MAX_LABELS } from "@/lib/triageConstants";
import { patchMessageSchema } from "@/schemas/triageSchema";

// PATCH /api/messages/:messageId — triage one message.
// Body (at least one key): { read?, archived?, labels?: {add?, remove?},
// assignedTo?: userId | null }. Responds { success, message } with the
// updated message as the caller sees it (withAiView: `read`, no readBy).
//
// Authorization, in order (a message the caller can't see is a 404, never a
// 403, so existence isn't leaked — same convention as the reply GET):
// - member of the message's org, and a MEMBER only for org-level / own-team
//   messages (canAccessQuestion on the message's teamId);
// - a member private thread (authorType "member") is visible only to its
//   author and OWNER/ADMIN, and supports `read` only (403 for anything else);
// - `read`: anyone who can see it (per-person state, message:read);
// - `archived`: message:triage, or the current assignee (the one exception);
// - `labels`, `assignedTo`: message:triage.
//
// The write is a single findOneAndUpdate (update pipeline) scoped by
// {_id, organizationId}; the assignee exception and the label cap are part
// of its filter, so a concurrent reassign / relabel can't slip past them.

const notFound = () =>
  NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
const bad = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const arr = (path: string) => ({ $ifNull: [path, []] });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) return bad("Not authenticated", 401);
    const userId = String(session.user._id);

    const { messageId } = await params;
    if (!isValidObjectId(messageId)) return notFound();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body");
    }
    const parsed = patchMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: parsed.error.format() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const message = await MessageModel.findById(messageId).select(
      "organizationId teamId authorType authorUserId assignedTo labels"
    );
    if (!message || !message.organizationId) return notFound();

    const membership = await MembershipModel.findOne({
      organizationId: message.organizationId,
      userId,
    });
    if (!membership || !can(membership.role, "message:read")) return notFound();
    const role = membership.role;

    const memberThread = message.authorType === "member";
    const isThreadOwner = memberThread && String(message.authorUserId) === userId;
    if (memberThread) {
      if (!isThreadOwner && !can(role, "message:reply")) return notFound();
      if (Object.keys(input).some((k) => k !== "read")) {
        return bad("Private threads support read/unread only", 403);
      }
    } else if (!(await canAccessQuestion({ teamId: message.teamId }, userId, role))) {
      return notFound();
    }

    const canTriage = can(role, "message:triage");
    const isAssignee = message.assignedTo != null && String(message.assignedTo) === userId;
    if ((input.labels || input.assignedTo !== undefined) && !canTriage) {
      return bad("Insufficient permissions", 403);
    }
    // The assignee exception covers archive/unarchive only.
    const viaAssignee = input.archived !== undefined && !canTriage;
    if (viaAssignee && !isAssignee) return bad("Insufficient permissions", 403);

    const now = new Date();
    const me = oid(userId);
    const set: Record<string, unknown> = {};
    const filter: Record<string, unknown> = {
      _id: message._id,
      organizationId: message.organizationId,
    };
    if (viaAssignee) filter.assignedTo = me;

    if (input.read === true) set.readBy = { $setUnion: [arr("$readBy"), [me]] };
    if (input.read === false) set.readBy = { $setDifference: [arr("$readBy"), [me]] };

    if (input.archived === true) {
      set.archivedAt = now;
      set.archivedBy = me;
    } else if (input.archived === false) {
      set.archivedAt = "$$REMOVE";
      set.archivedBy = "$$REMOVE";
    }

    if (input.labels) {
      const add = [...new Set(input.labels.add ?? [])];
      const remove = [...new Set(input.labels.remove ?? [])];
      if (add.length > 0) {
        const org = await OrganizationModel.findById(message.organizationId).select("labels");
        const known = new Set((org?.labels ?? []).map((l) => String(l._id)));
        if (!add.every((id) => known.has(id))) return bad("Unknown label");
      }
      const next = {
        $setDifference: [{ $setUnion: [arr("$labels"), add.map(oid)] }, remove.map(oid)],
      };
      // Empty ⇒ remove the field (keeps the doc out of the labels partial index).
      set.labels = { $cond: [{ $eq: [{ $size: next }, 0] }, "$$REMOVE", next] };
      filter.$expr = { $lte: [{ $size: next }, MESSAGE_MAX_LABELS] };
    }

    if (input.assignedTo === null) {
      set.assignedTo = "$$REMOVE";
      set.assignedAt = "$$REMOVE";
      set.assignedBy = "$$REMOVE";
    } else if (input.assignedTo !== undefined) {
      const target = await MembershipModel.findOne({
        organizationId: message.organizationId,
        userId: input.assignedTo,
      }).select("role");
      if (
        !target ||
        !(await canAccessQuestion({ teamId: message.teamId }, input.assignedTo, target.role))
      ) {
        return bad("That person can't be assigned to this message");
      }
      set.assignedTo = oid(input.assignedTo);
      set.assignedAt = now;
      set.assignedBy = me;
    }

    const updated = await MessageModel.findOneAndUpdate(filter, [{ $set: set }], {
      new: true,
    }).select("+ai +readBy");

    if (!updated) {
      // Tell apart the guards baked into the filter.
      const still = await MessageModel.findOne({
        _id: message._id,
        organizationId: message.organizationId,
      }).select("assignedTo");
      if (!still) return notFound();
      if (viaAssignee && String(still.assignedTo) !== userId) {
        return bad("Insufficient permissions", 403);
      }
      return bad(`A message can have at most ${MESSAGE_MAX_LABELS} labels`);
    }

    return NextResponse.json(
      {
        success: true,
        message: withAiViewOne(updated, role, {
          memberThread: isThreadOwner,
          viewerId: userId,
          readSince: effectiveReadSince(membership),
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error triaging message:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
