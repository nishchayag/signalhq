import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { can } from "@/lib/permissions";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { isValidObjectId } from "@/lib/objectId";
import { checkRateLimit } from "@/lib/rateLimit";
import { withAiViewOne } from "@/lib/messageView";
import { threadOf } from "@/lib/thread";

// GET /api/messages/:messageId/reply — fetch one message + its thread
// (`message`, plus `turns`: lib/thread.ts#threadOf, first turn included).
// Only two parties may view it: the member who owns a private
// (authorType: "member") thread, or an OWNER/ADMIN of the org (oversight).
// Returns 404 (not 403) on a mismatch so existence isn't leaked. Viewing
// marks the message read for the viewer (`message.read` is always true).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await connectDB();
  try {
    const { messageId } = await params;
    if (!isValidObjectId(messageId)) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }
    const message = await MessageModel.findById(messageId).select("+ai");
    if (!message || !message.organizationId) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const membership = await MembershipModel.findOne({
      organizationId: message.organizationId,
      userId: session.user._id,
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    const isThreadOwner =
      message.authorType === "member" &&
      String(message.authorUserId) === String(session.user._id);
    const isOrgOversight = can(membership.role, "message:reply");
    if (!isThreadOwner && !isOrgOversight) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    // Opening the thread reads it (per person; see lib/readState.ts).
    await MessageModel.updateOne(
      { _id: message._id },
      { $addToSet: { readBy: new mongoose.Types.ObjectId(String(session.user._id)) } }
    );

    // The thread's own author never sees how their words were classified.
    return NextResponse.json(
      {
        success: true,
        message: {
          ...withAiViewOne(message, membership.role, { memberThread: isThreadOwner }),
          read: true,
        },
        turns: threadOf(message),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching message thread:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/messages/:messageId/reply — the org replies to a message by
// appending an "org" turn to `replies[]` (append-only; replies can't be
// edited). Anonymous messages: the sender reads it via /r/[replyToken], and
// it clears `awaitingOrg`. Member threads: back-and-forth with that member.
// Either way this is OWNER/ADMIN only — it speaks for the org.
// Responds { success, message, replies, turns }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  await connectDB();
  try {
    const { messageId } = await params;
    if (!isValidObjectId(messageId)) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    const message = await MessageModel.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, message: "Message not found" },
        { status: 404 }
      );
    }

    if (!message.organizationId) {
      return NextResponse.json(
        { success: false, message: "This message cannot be replied to" },
        { status: 400 }
      );
    }

    const access = await requireOrgAccess(
      String(message.organizationId),
      "message:reply"
    );
    if (!access.ok) return access.response;

    const allowed = await checkRateLimit(`reply:${access.userId}`, 60, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, message: "Too many replies. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const result = questionResponseSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const now = new Date();
    message.replies = message.replies || [];
    message.replies.push({ authorRole: "org", content: result.data.content, createdAt: now });
    message.lastActivityAt = now;
    if (message.authorType !== "member") message.awaitingOrg = false;
    await message.save();
    // Replying implies having read it. Outbound, so lastInboundAt is left
    // alone: nobody else's read state changes.
    await MessageModel.updateOne(
      { _id: message._id },
      { $addToSet: { readBy: new mongoose.Types.ObjectId(access.userId) } }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Reply saved",
        replies: message.replies,
        turns: threadOf(message),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error replying to message:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
