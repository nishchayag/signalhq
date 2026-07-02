import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import { sendEmail } from "@/lib/mailService";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";

// Resends a fresh verification code (new 5-minute window) for an unverified
// signup that hasn't expired-and-been-deleted yet. Deliberately does NOT
// change the delete-on-expiry behavior in verifyEmail/route.ts — that's
// intentional (prevents indefinitely squatting a username/email on an
// unverified signup), this just gives a real user a way to get a working
// code before that deadline hits.
export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`resendOtp:${ip}`, 3, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again in a few minutes.",
          success: false,
        },
        { status: 429 }
      );
    }

    const { email, username } = await request.json();
    if (!email && !username) {
      return NextResponse.json(
        { error: "Email or username is required", success: false },
        { status: 400 }
      );
    }

    const user = await userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (!user) {
      return NextResponse.json(
        {
          error:
            "No pending signup found for that account. Please sign up again.",
          success: false,
        },
        { status: 404 }
      );
    }

    if (user.isVerified) {
      return NextResponse.json(
        {
          error: "This account is already verified. Please log in.",
          success: false,
        },
        { status: 400 }
      );
    }

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    user.verifyCode = verificationCode;
    user.verifyCodeExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    await sendEmail({
      email: user.email,
      mailType: "VERIFY",
      otpCode: verificationCode,
    });

    return NextResponse.json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error) {
    console.error("Error in resendOtp route:", error);
    return NextResponse.json(
      { error: "Error resending code: " + (error as Error).message, success: false },
      { status: 500 }
    );
  }
}
