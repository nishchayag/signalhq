import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { notifyNewMessage } from "@/lib/notifications";
import { canAccessQuestion } from "@/lib/questionAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { withAiViewOne } from "@/lib/messageView";
import { isAiEnabled } from "@/lib/ai";
import { runAfter } from "@/lib/background";
import { enrichMessage } from "@/lib/aiEnrichment";

// Room for the post-response AI enrichment (runAfter) on Vercel.
export const maxDuration = 30;

// GET /api/questions/:questionId/answer — resolve the caller's own private
// thread for this question, if they've answered it yet. Lets the dashboard
// find "my thread"'s messageId without the member needing to know it.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const question = await QuestionModel.findById(questionId).select(
      "organizationId teamId visibility questionText"
    );
    if (!question || question.visibility !== "internal") {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    const auth = await requireOrgAccess(
      String(question.organizationId),
      "question:answer"
    );
    if (!auth.ok) return auth.response;

    // Same team-scope rule as POST below and the question list: a MEMBER
    // can't even resolve the text of another team's internal question.
    if (!(await canAccessQuestion(question, auth.userId, auth.membership.role))) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    const thread = await MessageModel.findOne({
      questionId: question._id,
      authorType: "member",
      authorUserId: auth.userId,
    });

    return NextResponse.json(
      {
        success: true,
        question: { _id: question._id, questionText: question.questionText },
        // Always the caller's own thread: no "+ai", and memberThread strips
        // it regardless.
        thread: withAiViewOne(thread, auth.membership.role, { memberThread: true }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching own thread:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/questions/:questionId/answer — a logged-in member privately
// answers an internal-visibility question. Their first answer creates a new
// private thread (visible only to them + OWNER/ADMIN); answering again
// appends to that same thread rather than creating a second one.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();
  try {
    const { questionId } = await params;
    const question = await QuestionModel.findById(questionId);
    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    if (question.visibility !== "internal") {
      return NextResponse.json(
        { success: false, message: "This question does not accept internal answers" },
        { status: 400 }
      );
    }

    const auth = await requireOrgAccess(
      String(question.organizationId),
      "question:answer"
    );
    if (!auth.ok) return auth.response;

    // Team-scoped visibility, same rule as the question list: OWNER/ADMIN
    // see and can answer everything; MEMBER only within their own teams (or
    // org-level questions with no team).
    if (question.teamId && auth.membership.role === "MEMBER") {
      const team = await TeamModel.findOne({
        _id: question.teamId,
        members: auth.userId,
      });
      if (!team) {
        return NextResponse.json(
          { success: false, message: "Question not found" },
          { status: 404 }
        );
      }
    }

    // A new thread fires notifyNewMessage (possibly an immediate email), so
    // an unbounded loop here was an email cannon.
    const allowed = await checkRateLimit(`answer:${auth.userId}`, 30, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, message: "Too many answers. Please try again later." },
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
    const { content } = result.data;

    let message = await MessageModel.findOne({
      questionId: question._id,
      authorType: "member",
      authorUserId: auth.userId,
    });

    if (message) {
      message.replies = message.replies || [];
      message.replies.push({
        authorRole: "member",
        content,
        createdAt: new Date(),
      });
      await message.save();
    } else {
      const aiOn = isAiEnabled();
      message = await MessageModel.create({
        content,
        createdFor: question.userId,
        questionId: question._id,
        organizationId: question.organizationId,
        teamId: question.teamId,
        authorType: "member",
        authorUserId: auth.userId,
        replies: [],
        ...(aiOn && { ai: { status: "pending", attempts: 0 } }),
      });
      // New threads only; follow-ups aren't enriched. Never awaited.
      const created = message;
      if (aiOn) runAfter(() => enrichMessage(created._id));
      await QuestionModel.findByIdAndUpdate(question._id, {
        $inc: { responseCount: 1 },
      });
      await notifyNewMessage(question.userId);
    }

    return NextResponse.json(
      { success: true, message: "Answer saved", threadId: message._id },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error answering question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
