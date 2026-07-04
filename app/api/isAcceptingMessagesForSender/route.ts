import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";

export async function POST(request: NextRequest) {
  await connectDB();

  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }
    const user = await UserModel.findOne({
      username: username.toLowerCase(),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      isAcceptingMessages: user.isAcceptingMessages,
      success: true,
    });
  } catch (error: unknown) {
    console.error("Error fetching user acceptance status:", error);
    return NextResponse.json(
      {
        error: "Error fetching acceptance status: " + (error as Error).message,
      },
      { status: 500 }
    );
  }
}
