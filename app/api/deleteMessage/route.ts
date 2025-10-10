import { NextResponse, NextRequest } from "next/server";
import { User } from "next-auth";
import connectDB from "@/lib/connectDB";
import authOptions from "@/lib/nextAuthOptions";
import UserModel from "@/models/user.model";
import messageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import { getServerSession } from "next-auth";

export async function POST(request: NextRequest) {
  await connectDB();

  try {
    const { messageId } = await request.json();
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { message: "Unauthorized", success: false },
        { status: 401 }
      );
    }

    const user: User = session.user as User;

    // First, get the message to check if it has a questionId
    const message = await messageModel.findById(messageId);

    if (!message) {
      return NextResponse.json(
        { message: "Message not found", success: false },
        { status: 404 }
      );
    }

    // Check if user owns this message (either directly or through question ownership)
    const isUserMessage = message.createdFor.toString() === user._id;
    let isQuestionOwner = false;

    if (message.questionId) {
      const question = await QuestionModel.findById(message.questionId);
      isQuestionOwner = question
        ? question.userId.toString() === user._id
        : false;
    }

    if (!isUserMessage && !isQuestionOwner) {
      return NextResponse.json(
        { message: "Unauthorized to delete this message", success: false },
        { status: 403 }
      );
    }

    // Delete the message from user's messages array only if it's the user's message
    if (isUserMessage) {
      await UserModel.findOneAndUpdate(
        { _id: user._id },
        {
          $pull: {
            messages: { _id: messageId },
          },
        },
        { new: true }
      );
    }

    // Delete the message document
    await messageModel.findByIdAndDelete(messageId);

    // If the message was associated with a question, decrement the response count
    if (message.questionId) {
      await QuestionModel.findByIdAndUpdate(
        message.questionId,
        { $inc: { responseCount: -1 } },
        { new: true }
      );
      console.log(
        `Decremented response count for question ${message.questionId}`
      );
    }

    return NextResponse.json(
      { message: "Message deleted successfully", success: true },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error deleting message:", error);
    return NextResponse.json(
      { message: "Failed to delete message", success: false },
      { status: 500 }
    );
  }
}
