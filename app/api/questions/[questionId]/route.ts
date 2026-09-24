import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import { updateQuestionSchema } from "@/schemas/questionSchema";
import { can } from "@/lib/permissions";
import { loadAndAuthorize } from "@/lib/questionAccess";
import { parsePagination, paginate, parseSearchQuery } from "@/lib/pagination";
import { withAiView } from "@/lib/messageView";

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
      .limit(limit + 1)
      .select("+ai");
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
      {
        success: true,
        question,
        messages: withAiView(page, authz.role),
        hasMore,
        nextCursor,
      },
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

    const deletedMessages = await MessageModel.deleteMany({ questionId });
    await QuestionModel.findByIdAndDelete(questionId);

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
