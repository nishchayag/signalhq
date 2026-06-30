import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel, { IQuestion } from "@/models/question.model";
import MessageModel from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import { updateQuestionSchema } from "@/schemas/questionSchema";
import { can, Permission } from "@/lib/permissions";

type AuthzOk = { ok: true; question: IQuestion };
type AuthzFail = { ok: false; response: NextResponse };

/**
 * Load a question and authorize the caller against it. Org-owned questions are
 * gated by membership + role permission; legacy questions without an org fall
 * back to owner-only access.
 */
async function loadAndAuthorize(
  questionId: string,
  permission?: Permission
): Promise<AuthzOk | AuthzFail> {
  const session = await getServerSession(authOptions);
  if (!session?.user?._id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  const question = await QuestionModel.findById(questionId);
  if (!question) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      ),
    };
  }

  if (question.organizationId) {
    const membership = await MembershipModel.findOne({
      organizationId: question.organizationId,
      userId: session.user._id,
    });
    if (!membership) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: "Question not found" },
          { status: 404 }
        ),
      };
    }
    if (permission && !can(membership.role, permission)) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 }
        ),
      };
    }
  } else if (String(question.userId) !== String(session.user._id)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      ),
    };
  }

  return { ok: true, question };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId);
    if (!authz.ok) return authz.response;

    const messages = await MessageModel.find({ questionId }).sort({
      createdAt: -1,
    });

    return NextResponse.json(
      { success: true, question: authz.question, messages },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:update");
    if (!authz.ok) return authz.response;

    const body = await request.json();
    const result = updateQuestionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const question = await QuestionModel.findByIdAndUpdate(
      questionId,
      result.data,
      { new: true }
    );

    return NextResponse.json(
      { success: true, message: "Question updated successfully", question },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:update");
    if (!authz.ok) return authz.response;

    const { isActive } = await request.json();
    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const question = await QuestionModel.findByIdAndUpdate(
      questionId,
      { isActive },
      { new: true }
    );

    return NextResponse.json(
      {
        success: true,
        message: `Question ${isActive ? "activated" : "deactivated"} successfully`,
        question,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating question status:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId, "question:delete");
    if (!authz.ok) return authz.response;

    const messagesToDelete = await MessageModel.find({ questionId }).select(
      "_id"
    );
    const messageIds = messagesToDelete.map((m) => m._id);

    const deletedMessages = await MessageModel.deleteMany({ questionId });
    await QuestionModel.findByIdAndDelete(questionId);

    // Keep the owner's denormalized messages array consistent.
    if (messageIds.length > 0) {
      const { default: UserModel } = await import("@/models/user.model");
      await UserModel.updateOne(
        { _id: authz.question.userId },
        { $pull: { messages: { $in: messageIds } } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Question and ${deletedMessages.deletedCount} response(s) deleted successfully`,
        deletedResponses: deletedMessages.deletedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
