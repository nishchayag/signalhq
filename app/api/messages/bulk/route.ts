import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rateLimit";
import { effectiveReadSince, unreadClause } from "@/lib/readState";
import { narrow, orgInboxScope } from "@/lib/triageScope";
import { bulkMessagesSchema } from "@/schemas/triageSchema";

// POST /api/messages/bulk — triage many messages in the ACTIVE org at once.
//   {ids: id[1..100], action: "read"|"unread"|"archive"|"unarchive"}
//     → { success, modified }
//   {scope: {general: true} | {questionId}, action: "markAllRead"}
//     → { success, modified, hasMore }  (≤ MARK_ALL_CAP per call; call
//       again while hasMore)
//
// Every update's filter is lib/triageScope.ts#orgInboxScope — active org,
// never member private threads, MEMBER team scope — so ids from another org
// or team, or member threads, simply don't match (no error, just not
// modified). archive/unarchive need message:triage; the single-message
// assignee exception isn't offered in bulk (keeps this path one rule).

const MARK_ALL_CAP = 1000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const bad = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);
    if (!ctx) return bad("No active organization", 401);
    if (!can(ctx.role, "message:read")) return bad("Insufficient permissions", 403);
    const userId = String(ctx.membership.userId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body");
    }
    const parsed = bulkMessagesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: parsed.error.format() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    if (
      (input.action === "archive" || input.action === "unarchive") &&
      !can(ctx.role, "message:triage")
    ) {
      return bad("Insufficient permissions", 403);
    }

    if (!(await checkRateLimit(`bulk:${userId}`, RATE_LIMIT, RATE_WINDOW_MS))) {
      return bad("Too many bulk actions. Please try again later.", 429);
    }

    const me = new mongoose.Types.ObjectId(userId);
    const scope = await orgInboxScope(ctx.organizationId, userId, ctx.role);

    if ("ids" in input) {
      const ids = [...new Set(input.ids)].map((id) => new mongoose.Types.ObjectId(id));
      const filter = narrow(scope, { _id: { $in: ids } });
      const now = new Date();
      const update =
        input.action === "read"
          ? { $addToSet: { readBy: me } }
          : input.action === "unread"
            ? { $pull: { readBy: me } }
            : input.action === "archive"
              ? { $set: { archivedAt: now, archivedBy: me } }
              : { $unset: { archivedAt: "", archivedBy: "" } };
      const res = await MessageModel.updateMany(filter, update);
      return NextResponse.json({ success: true, modified: res.modifiedCount });
    }

    // markAllRead: the viewer's unread messages in one list (general, or one
    // question), open or archived alike, capped per call.
    const listClause =
      "general" in input.scope
        ? { questionId: null }
        : { questionId: new mongoose.Types.ObjectId(input.scope.questionId) };
    const viewer = { userId, readSince: effectiveReadSince(ctx.membership) };
    const filter = narrow(scope, listClause, unreadClause(viewer));
    const batch = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(MARK_ALL_CAP + 1)
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    const hasMore = batch.length > MARK_ALL_CAP;
    const ids = batch.slice(0, MARK_ALL_CAP).map((d) => d._id);
    const res = ids.length
      ? await MessageModel.updateMany(narrow(scope, { _id: { $in: ids } }), {
          $addToSet: { readBy: me },
        })
      : { modifiedCount: 0 };
    return NextResponse.json({ success: true, modified: res.modifiedCount, hasMore });
  } catch (error) {
    console.error("Error in bulk triage:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
