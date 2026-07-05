import { NextResponse, NextRequest } from "next/server";
import connectDB from "@/lib/connectDB";
import authOptions from "@/lib/nextAuthOptions";
import UserModel from "@/models/user.model";
import messageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import { getServerSession } from "next-auth";
import { requireOrgAccess } from "@/lib/apiAuth";

export async function POST(request: NextRequest) {
  await connectDB();

  try {
    const { messageId } = await request.json();

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

    // Keep the recipient's denormalized messages array consistent regardless
    // of who performed the delete.
    await UserModel.updateOne(
      { _id: message.createdFor },
      { $pull: { messages: message._id } }
    );

    await messageModel.findByIdAndDelete(messageId);

    if (message.questionId) {
      await QuestionModel.findByIdAndUpdate(message.questionId, {
        $inc: { responseCount: -1 },
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
