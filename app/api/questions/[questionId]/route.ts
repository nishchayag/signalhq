import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel, { IQuestion } from "@/models/question.model";
import MessageModel from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import { updateQuestionSchema } from "@/schemas/questionSchema";
import { can, Permission } from "@/lib/permissions";
import type { MembershipRole } from "@/models/membership.model";
import { parsePagination, paginate, parseSearchQuery } from "@/lib/pagination";

// `role` is null for legacy org-less questions (owner-only access, no org role).
type AuthzOk = { ok: true; question: IQuestion; role: MembershipRole | null };
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

  let role: MembershipRole | null = null;
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
    role = membership.role;
  } else if (String(question.userId) !== String(session.user._id)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      ),
    };
  }

  return { ok: true, question, role };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const authz = await loadAndAuthorize(questionId);
    if (!authz.ok) return authz.response;

    const { limit, before } = parsePagination(request);
    const search = parseSearchQuery(request);
    const filter: Record<string, unknown> = {
      questionId,
      // Member-authored private threads (internal questions) are never
      // returned here — this general endpoint is org-membership-gated only,
      // not per-thread-owner-gated. They're only reachable through the
      // dedicated question:answer / question:viewAllReplies routes, which
      // enforce per-member thread privacy.
      authorType: { $ne: "member" },
    };
    if (before) filter.createdAt = { $lt: before };
    if (search) filter.content = { $regex: search, $options: "i" };

    const fetched = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1);
    const { page, hasMore, nextCursor } = paginate(fetched, limit);

    // Same privacy rule as the list endpoint: a MEMBER must not learn how
    // many colleagues answered an internal question.
    const question = authz.question.toObject() as Record<string, unknown>;
    if (
      authz.question.visibility === "internal" &&
      authz.role &&
      !can(authz.role, "question:viewAllReplies")
    ) {
      delete question.responseCount;
    }

    return NextResponse.json(
      { success: true, question, messages: page, hasMore, nextCursor },
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
      "_id createdFor"
    );
    const messageIds = messagesToDelete.map((m) => m._id);

    const deletedMessages = await MessageModel.deleteMany({ questionId });
    await QuestionModel.findByIdAndDelete(questionId);

    // Keep denormalized User.messages arrays consistent — pull from every
    // recipient the messages actually point at (createdFor), not just the
    // question creator's, in case those ever diverge.
    if (messageIds.length > 0) {
      const recipientIds = [
        ...new Set(messagesToDelete.map((m) => String(m.createdFor))),
      ];
      const { default: UserModel } = await import("@/models/user.model");
      await UserModel.updateMany(
        { _id: { $in: recipientIds } },
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
