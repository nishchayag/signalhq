import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { parsePagination, paginate } from "@/lib/pagination";
import { withAiView } from "@/lib/messageView";

// GET /api/questions/:questionId/replies — OWNER/ADMIN oversight view:
// every member's private thread on this question, one entry per member.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const question = await QuestionModel.findById(questionId).select(
      "questionText organizationId visibility"
    );
    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    const auth = await requireOrgAccess(
      String(question.organizationId),
      "question:viewAllReplies"
    );
    if (!auth.ok) return auth.response;

    // Ensure User is registered before populate — see CLAUDE.md's Mongoose
    // populate gotcha note.
    void UserModel;

    const { limit, before } = parsePagination(request);
    const filter: Record<string, unknown> = {
      questionId,
      authorType: "member",
    };
    if (before) filter.createdAt = { $lt: before };

    const fetched = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("authorUserId", "name username")
      .select("content createdAt replies authorUserId +ai");
    const { page, hasMore, nextCursor } = paginate(fetched, limit);
    // OWNER/ADMIN oversight view; an OWNER/ADMIN's own answer (if they
    // answered too) still hides its AI fields from them, like any author.
    const threads = page.map((t) => {
      const author = t.authorUserId as unknown as { _id?: unknown } | null;
      const own = String(author?._id ?? author) === auth.userId;
      return withAiView([t], auth.membership.role, { memberThread: own })[0];
    });

    return NextResponse.json(
      {
        success: true,
        question: { _id: question._id, questionText: question.questionText },
        threads,
        hasMore,
        nextCursor,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching question replies:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
