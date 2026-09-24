import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { effectiveReadSince, unreadClause } from "@/lib/readState";
import { narrow, orgInboxScope } from "@/lib/triageScope";

// GET /api/messages/counts — the active org's badge counts for the viewer:
//   { success, general: { unread }, questions: { <questionId>: unread },
//     assignedToMe }
// `unread` counts OPEN (not archived) messages unread by the viewer — the
// same set the list routes return for ?unread=1 (default status=open),
// built from the same helpers (orgInboxScope, unreadClause) so badge and
// list can't disagree. `questions` lists only questions with unread > 0.
// `assignedToMe`: open messages assigned to the viewer, read or not.
export async function GET() {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    const ctx = await resolveActiveContext(session);
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: "No active organization" },
        { status: 401 }
      );
    }
    if (!can(ctx.role, "message:read")) {
      return NextResponse.json(
        { success: false, message: "Insufficient permissions" },
        { status: 403 }
      );
    }
    const userId = String(ctx.membership.userId);
    const scope = await orgInboxScope(ctx.organizationId, userId, ctx.role);
    const open = { archivedAt: null };
    const viewer = { userId, readSince: effectiveReadSince(ctx.membership) };

    const [groups, assignedToMe] = await Promise.all([
      MessageModel.aggregate<{ _id: mongoose.Types.ObjectId | null; unread: number }>([
        { $match: narrow(scope, open, unreadClause(viewer)) },
        { $group: { _id: { $ifNull: ["$questionId", null] }, unread: { $sum: 1 } } },
      ]),
      MessageModel.countDocuments(
        narrow(scope, open, { assignedTo: new mongoose.Types.ObjectId(userId) })
      ),
    ]);

    let general = 0;
    const questions: Record<string, number> = {};
    for (const g of groups) {
      if (g._id == null) general = g.unread;
      else questions[String(g._id)] = g.unread;
    }

    return NextResponse.json({
      success: true,
      general: { unread: general },
      questions,
      assignedToMe,
    });
  } catch (error) {
    console.error("Error computing message counts:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
