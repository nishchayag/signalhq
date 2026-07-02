import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import { questionResponseSchema } from "@/schemas/questionSchema";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { moderateContent } from "@/lib/contentModeration";

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
      .select("questionText description slug userId");

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

    return NextResponse.json(
      {
        success: true,
        question: {
          questionText: question.questionText,
          description: question.description,
          slug: question.slug,
          username: populatedQuestion.userId.username,
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
    const message = new MessageModel({
      content,
      createdFor: question.userId,
      questionId: question._id,
      // Mirror the question's org/team onto the response for scoped reads.
      organizationId: question.organizationId,
      teamId: question.teamId,
      replyToken,
    });

    await message.save();

    // Update response count
    await QuestionModel.findByIdAndUpdate(question._id, {
      $inc: { responseCount: 1 },
    });

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
