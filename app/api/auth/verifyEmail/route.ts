import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
export async function POST(request: NextRequest) {
  await connectDB();
  try {
    // Cap OTP guesses — a 6-digit code inside a 5-minute window is only safe
    // if attempts are bounded.
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`verifyEmail:${ip}`, 10, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many attempts. Please try again in a few minutes.",
          success: false,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { otpCode } = body;
    // Stored lowercase — normalize like login does, so a mixed-case email
    // still matches.
    const email = body.email?.toLowerCase();
    const username = body.username?.toLowerCase();
    if ((!email && !username) || !otpCode) {
      return NextResponse.json(
        { error: "All fields are required", success: false },
        { status: 400 }
      );
    }
    const existingUser = await userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (!existingUser) {
      return NextResponse.json(
        {
          error: "Invalid Email/Username or OTP",
          success: false,
        },
        { status: 400 }
      );
    }
    if (existingUser.verifyCodeExpiry < new Date()) {
      await userModel.deleteOne({ $or: [{ email }, { username }] });
      return NextResponse.json(
        {
          success: false,
          error:
            "OTP has expired, please signup again since you didn't verify your email in time, and the user credentials have been removed.",
        },
        { status: 400 }
      );
    }
    if (existingUser.verifyCode !== otpCode) {
      return NextResponse.json(
        { error: "Invalid OTP code", success: false },
        { status: 400 }
      );
    }
    existingUser.isVerified = true;
    existingUser.verifyCode = undefined;
    existingUser.verifyCodeExpiry = undefined;
    await existingUser.save();
    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
      user: {
        email: existingUser.email,
        username: existingUser.username,
        name: existingUser.name,
      },
    });
  } catch (error) {
    console.error("Error in email verification:", error);
    return NextResponse.json(
      { error: "Error while verification: " + (error as Error).message, success: false },
      { status: 500 }
    );
  }
}
