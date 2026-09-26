import { NextResponse, NextRequest } from "next/server";
import connectDB from "@/lib/connectDB";
import authOptions from "@/lib/nextAuthOptions";
import messageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import AiInsightModel from "@/models/aiInsight.model";
import { getServerSession } from "next-auth";
import { requireOrgAccess } from "@/lib/apiAuth";
import { isValidObjectId } from "@/lib/objectId";

export async function POST(request: NextRequest) {
  await connectDB();

  try {
    const { messageId } = await request.json();

    // Must be a real id string — an object here ({"$ne": null}) would be
    // passed straight into findById, and junk would CastError → 500.
    if (!isValidObjectId(messageId)) {
      return NextResponse.json(
        { message: "Message not found", success: false },
        { status: 404 }
      );
    }

    const message = await messageModel.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { message: "Message not found", success: false },
        { status: 404 }
      );
    }

    if (message.organizationId) {
      // Org-scoped message: role-based, not identity-based — createdFor is
      // always the org's original creator, so an identity check silently
      // 403s every other OWNER/ADMIN who can otherwise see the message.
      const auth = await requireOrgAccess(
        String(message.organizationId),
        "message:delete"
      );
      if (!auth.ok) return auth.response;
    } else {
      // Legacy pre-org message: recipient (or owning question's creator) only.
      const session = await getServerSession(authOptions);
      if (!session?.user?._id) {
        return NextResponse.json(
          { message: "Unauthorized", success: false },
          { status: 401 }
        );
      }
      const isRecipient =
        String(message.createdFor) === String(session.user._id);
      let isQuestionOwner = false;
      if (!isRecipient && message.questionId) {
        const question = await QuestionModel.findById(message.questionId);
        isQuestionOwner = question
          ? String(question.userId) === String(session.user._id)
          : false;
      }
      if (!isRecipient && !isQuestionOwner) {
        return NextResponse.json(
          { message: "Unauthorized to delete this message", success: false },
          { status: 403 }
        );
      }
    }

    await messageModel.findByIdAndDelete(messageId);

    if (message.questionId) {
      await QuestionModel.findByIdAndUpdate(message.questionId, {
        $inc: { responseCount: -1 },
      });
    }

    // A cached insight may have quoted this message verbatim — simplest
    // correct approach is to drop the whole summary for its scope rather
    // than try to patch just the affected quote/count.
    if (message.organizationId) {
      await AiInsightModel.deleteOne({
        organizationId: message.organizationId,
        scope: message.questionId ? "question" : "general",
        questionId: message.questionId ?? null,
      });
    }

    return NextResponse.json(
      { message: "Message deleted successfully", success: true },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error deleting message:", error);
    return NextResponse.json(
      { message: "Failed to delete message", success: false },
      { status: 500 }
    );
  }
}
