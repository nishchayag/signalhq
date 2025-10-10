import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import { createQuestionSchema } from "@/schemas/questionSchema";
import { nanoid } from "nanoid";

export async function POST(request: NextRequest) {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = createQuestionSchema.safeParse(body);

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

    const { questionText, description } = result.data;

    // Generate a unique slug for the question
    let slug = nanoid(8);
    let existingQuestion = await QuestionModel.findOne({ slug });

    // Ensure slug is unique
    while (existingQuestion) {
      slug = nanoid(8);
      existingQuestion = await QuestionModel.findOne({ slug });
    }

    const question = new QuestionModel({
      questionText,
      description,
      userId: session.user._id,
      slug,
    });

    await question.save();

    return NextResponse.json(
      {
        success: true,
        message: "Question created successfully",
        question: {
          _id: question._id,
          questionText: question.questionText,
          description: question.description,
          slug: question.slug,
          isActive: question.isActive,
          responseCount: question.responseCount,
          createdAt: question.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating question:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const questions = await QuestionModel.find({ userId: session.user._id })
      .sort({ createdAt: -1 })
      .select("questionText description slug isActive responseCount createdAt");

    return NextResponse.json(
      {
        success: true,
        questions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
