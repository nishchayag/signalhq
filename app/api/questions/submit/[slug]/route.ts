import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
// Registers the User model for the .populate("userId") below — serverless
// bundles don't necessarily share model registration.
import "@/models/user.model";
import { buildAnswerSchema } from "@/schemas/questionSchema";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { moderateContent } from "@/lib/contentModeration";
import { notifyMessageEvent } from "@/lib/notifications";
import { isAiEnabled } from "@/lib/ai";
import { runAfter } from "@/lib/background";
import { enrichMessage } from "@/lib/aiEnrichment";
import { isGuardOffered } from "@/lib/aiQuota";
import { publicQuestionConfig, questionState } from "@/lib/answers";
import { QUESTION_CLOSED, withResponseSlot } from "@/lib/answerClaim";

// Room for the post-response AI enrichment (runAfter) on Vercel.
export const maxDuration = 30;

// "internal" questions have no public access at all — treated as not-found,
// same as an inactive question. `$ne: "internal"` (not `visibility:
// "public"`) so pre-migration questions with no `visibility` still match.
const publicFilter = (slug: string) => ({
  slug,
  isActive: true,
  visibility: { $ne: "internal" },
});

// GET → { question: { questionText, description, slug, username,
//   guardAvailable, config: PublicQuestionConfig, closesAt, closed } }
// A closed question is still 200 (the page shows a closed card), with
// `closed: { reason: "date" | "cap" }`; open ⇒ `closed: null`.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await connectDB();

  try {
    const { slug } = await params;

    const question = await QuestionModel.findOne(publicFilter(slug))
      .populate("userId", "username")
      .select(
        "questionText description slug userId organizationId type config closesAt maxResponses responseCount"
      );

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found or inactive" },
        { status: 404 }
      );
    }

    const populatedQuestion = question as unknown as { userId: { username?: string } | null };
    const state = questionState(question);

    // Whether the form should offer the AI anonymity guard. A boolean only —
    // quota numbers never reach this public endpoint. Legacy questions with
    // no org can't be guarded (the guard meters per org); nor can a closed
    // question, which has no form.
    const guardAvailable =
      question.organizationId && !state.closed
        ? await isGuardOffered(question.organizationId)
        : false;

    return NextResponse.json(
      {
        success: true,
        question: {
          questionText: question.questionText,
          description: question.description,
          slug: question.slug,
          username: populatedQuestion.userId?.username,
          guardAvailable,
          // Never responseCount or maxResponses: the cap would leak the count.
          config: publicQuestionConfig(question),
          closesAt: question.closesAt ?? null,
          closed: state.closed ? { reason: state.reason } : null,
        },
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

// POST body: text → { content }; rating/nps → { score, content? };
// single/multi → { choices: optionId[], content? }.
// 201 { replyToken } | 400 invalid | 404 not found | 410 QUESTION_CLOSED | 429.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await connectDB();

  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`questionSubmit:${ip}`, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many messages sent from this location. Please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    const { slug } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    // The question's type decides the body schema, so it's looked up first.
    const question = await QuestionModel.findOne(publicFilter(slug));
    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found or inactive" },
        { status: 404 }
      );
    }
    // Fast path for the common case; the atomic claim below is the guard.
    if (questionState(question).closed) {
      return NextResponse.json(QUESTION_CLOSED, { status: 410 });
    }

    const result = buildAnswerSchema(question).safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }
    const { content, answer } = result.data;
    const hasComment = content.length > 0;

    if (hasComment) {
      const moderation = moderateContent(content);
      if (!moderation.allowed) {
        return NextResponse.json(
          { success: false, message: moderation.reason },
          { status: 400 }
        );
      }
    }

    const replyToken = nanoid(32);
    // Enrichment (moderation, tags, embedding) reads the comment only; a
    // typed answer with no comment gets no `ai` field at all.
    const enrich = isAiEnabled() && hasComment;
    const now = new Date();

    const message = await withResponseSlot(question, async () => {
      const doc = new MessageModel({
        content,
        ...(answer && { answer }),
        createdAt: now,
        lastInboundAt: now,
        createdFor: question.userId,
        questionId: question._id,
        // Mirror the question's org/team onto the response for scoped reads.
        organizationId: question.organizationId,
        teamId: question.teamId,
        replyToken,
        ...(enrich && { ai: { status: "pending", attempts: 0 } }),
      });
      await doc.save();
      return doc;
    });
    if (!message) {
      return NextResponse.json(QUESTION_CLOSED, { status: 410 });
    }

    // After the response; never awaited, never fails the submission.
    if (enrich) runAfter(() => enrichMessage(message._id));

    // Emails after the response, too: the sender never waits on Resend.
    runAfter(() =>
      notifyMessageEvent({
        organizationId: question.organizationId,
        primaryUserIds: [question.userId],
        event: "new",
        messageId: message._id,
      })
    );

    return NextResponse.json(
      {
        success: true,
        message: "Response submitted successfully",
        replyToken,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error submitting response:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
