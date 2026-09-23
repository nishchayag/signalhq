import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { deleteUnverifiedUser } from "@/lib/orgCleanup";
import { identifierQuery } from "@/lib/authIdentifiers";

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    // Cap OTP guesses — a 6-digit code inside a 5-minute window is only safe
    // if attempts are bounded. Per IP *and* per account: the per-IP limit
    // alone lets a code be guessed from many IPs.
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
    const query = identifierQuery(body);
    const otpCode = typeof body?.otpCode === "string" ? body.otpCode : null;
    if (!query || !otpCode) {
      return NextResponse.json(
        { error: "All fields are required", success: false },
        { status: 400 }
      );
    }

    const accountAllowed = await checkRateLimit(
      `verifyEmail:acct:${query.key}`,
      5,
      10 * 60 * 1000
    );
    if (!accountAllowed) {
      return NextResponse.json(
        {
          error: "Too many attempts for this account. Please try again in a few minutes.",
          success: false,
        },
        { status: 429 }
      );
    }

    const existingUser = await userModel.findOne(query.filter);
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
      // Delete by _id through the shared helper so the personal org and
      // membership created at signup go with it (deleting only the User
      // used to orphan them and keep the org slug taken).
      if (!existingUser.isVerified) await deleteUnverifiedUser(existingUser._id);
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
      { error: "Something went wrong while verifying. Please try again.", success: false },
      { status: 500 }
    );
  }
}
