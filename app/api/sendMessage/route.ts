import messageModel from "@/models/message.model";
import { NextResponse, NextRequest } from "next/server";
import UserModel from "@/models/user.model";
import connectDB from "@/lib/connectDB";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`sendMessage:${ip}`, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many messages sent from this location. Please try again in a few minutes.",
          success: false,
        },
        { status: 429 }
      );
    }

    const { username, email, content } = await request.json();
    if ((!username && !email) || !content) {
      return NextResponse.json({ error: "Username and content are required" });
    }
    const user = await UserModel.findOne({
      $or: [{ username }, { email }],
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" });
    }

    if (!user.isAcceptingMessages) {
      return NextResponse.json({ error: "User is not accepting messages" });
    }

    const replyToken = nanoid(32);
    const newMessage = await messageModel.create({
      content,
      createdAt: new Date(),
      createdFor: user._id,
      replyToken,
    });

    user.messages.push(newMessage._id);
    await user.save();
    return NextResponse.json({
      message: "Message sent successfully",
      success: true,
      replyToken,
    });
  } catch (error: unknown) {
    console.error("Error in sendMessage route:", error);
    return NextResponse.json({
      error: "Error sending message: " + (error as Error).message,
      success: false,
    });
  }
}
