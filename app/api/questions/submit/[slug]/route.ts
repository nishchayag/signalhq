import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { moderateContent } from "@/lib/contentModeration";
import { notifyNewMessage } from "@/lib/notifications";
import { isAiEnabled } from "@/lib/ai";
import { runAfter } from "@/lib/background";
import { enrichMessage } from "@/lib/aiEnrichment";
import { isGuardOffered } from "@/lib/aiQuota";

// Room for the post-response AI enrichment (runAfter) on Vercel.
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await connectDB();

  try {
    const { slug } = await params;

    // "internal" questions have no public access at all — treated as
    // not-found here, same as an inactive question. `$ne: "internal"`
    // (not `visibility: "public"`) so pre-migration questions with no
    // `visibility` field stored yet still match — they default to public.
    const question = await QuestionModel.findOne({
      slug,
      isActive: true,
      visibility: { $ne: "internal" },
    })
      .populate("userId", "username")
      .select("questionText description slug userId organizationId");

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found or inactive" },
        { status: 404 }
      );
    }

    const populatedQuestion = question as unknown as {
      userId: { username: string };
      questionText: string;
      description?: string;
      slug: string;
    };

    // Whether the form should offer the AI anonymity guard. A boolean only —
    // quota numbers never reach this public endpoint. Legacy questions with
    // no org can't be guarded (the guard meters per org).
    const guardAvailable = question.organizationId
      ? await isGuardOffered(question.organizationId)
      : false;

    return NextResponse.json(
      {
        success: true,
        question: {
          questionText: question.questionText,
          description: question.description,
          slug: question.slug,
          username: populatedQuestion.userId.username,
          guardAvailable,
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
    const body = await request.json();

    const result = questionResponseSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid input",
          errors: result.error.format(),
        },
        { status: 400 }
      );
    }

    const moderation = moderateContent(result.data.content);
    if (!moderation.allowed) {
      return NextResponse.json(
        { success: false, message: moderation.reason },
        { status: 400 }
      );
    }

    const question = await QuestionModel.findOne({
      slug,
      isActive: true,
      visibility: { $ne: "internal" },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found or inactive" },
        { status: 404 }
      );
    }

    const { content } = result.data;

    const replyToken = nanoid(32);
    const aiOn = isAiEnabled();
    const now = new Date();
    const message = new MessageModel({
      content,
      createdAt: now,
      lastInboundAt: now,
      createdFor: question.userId,
      questionId: question._id,
      // Mirror the question's org/team onto the response for scoped reads.
      organizationId: question.organizationId,
      teamId: question.teamId,
      replyToken,
      ...(aiOn && { ai: { status: "pending", attempts: 0 } }),
    });

    await message.save();
    // After the response; never awaited, never fails the submission.
    if (aiOn) runAfter(() => enrichMessage(message._id));

    // Update response count
    await QuestionModel.findByIdAndUpdate(question._id, {
      $inc: { responseCount: 1 },
    });

    await notifyNewMessage(question.userId);

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
