import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";
import { updateQuestionSchema } from "@/schemas/questionSchema";
import mongoose from "mongoose";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const { questionId } = await params;

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const question = await QuestionModel.findOne({
      _id: questionId,
      userId: session.user._id,
    });

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    // Get messages for this question
    console.log("Searching for messages with questionId:", questionId);

    // Convert string to ObjectId for proper comparison
    const questionObjectId = new mongoose.Types.ObjectId(questionId);

    // Try different query approaches to debug
    const allMessages = await MessageModel.find({});
    console.log("All messages in database:", allMessages.length);

    const messagesWithQuestionId = await MessageModel.find({
      questionId: { $exists: true },
    });
    console.log(
      "Messages with questionId field:",
      messagesWithQuestionId.length
    );

    if (messagesWithQuestionId.length > 0) {
      console.log("Sample message with questionId:", messagesWithQuestionId[0]);
    }

    // Try both string and ObjectId queries
    const messagesByString = await MessageModel.find({
      questionId: questionId,
    }).sort({ createdAt: -1 });

    const messagesByObjectId = await MessageModel.find({
      questionId: questionObjectId,
    }).sort({ createdAt: -1 });

    console.log("Question ID:", questionId);
    console.log("Question ID type:", typeof questionId);
    console.log("Messages by string query:", messagesByString.length);
    console.log("Messages by ObjectId query:", messagesByObjectId.length);

    // Use the query that returns results
    const messages =
      messagesByObjectId.length > 0 ? messagesByObjectId : messagesByString;

    console.log("Final messages result:", messages.length);

    return NextResponse.json(
      {
        success: true,
        question,
        messages,
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
    const session = await getServerSession(authOptions);
    const { questionId } = await params;

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = updateQuestionSchema.safeParse(body);

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

    const question = await QuestionModel.findOneAndUpdate(
      { _id: questionId, userId: session.user._id },
      result.data,
      { new: true }
    );

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Question updated successfully",
        question,
      },
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
    const session = await getServerSession(authOptions);
    const { questionId } = await params;

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const question = await QuestionModel.findOneAndUpdate(
      {
        _id: questionId,
        userId: session.user._id,
      },
      { isActive },
      { new: true }
    );

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

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
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const { questionId } = await params;

    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const question = await QuestionModel.findOneAndDelete({
      _id: questionId,
      userId: session.user._id,
    });

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found" },
        { status: 404 }
      );
    }

    // Count messages before deletion for logging
    const messageCount = await MessageModel.countDocuments({
      questionId: questionId,
    });

    console.log(
      `Deleting question ${questionId} with ${messageCount} responses`
    );

    // Get all messages for this question before deletion (to clean up user's messages array)
    const messagesToDelete = await MessageModel.find({
      questionId: questionId,
    }).select("_id");

    const messageIds = messagesToDelete.map((msg) => msg._id);

    // Delete all messages for this question
    const deletedMessages = await MessageModel.deleteMany({
      questionId: questionId,
    });

    // Clean up user's messages array by removing the deleted message IDs
    if (messageIds.length > 0) {
      await UserModel.updateOne(
        { _id: session.user._id },
        { $pull: { messages: { $in: messageIds } } }
      );
      console.log(
        `Cleaned up ${messageIds.length} message references from user's messages array`
      );
    }

    console.log(
      `Successfully deleted question and ${deletedMessages.deletedCount} responses`
    );

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
