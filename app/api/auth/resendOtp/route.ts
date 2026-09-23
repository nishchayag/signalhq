import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import { sendEmail } from "@/lib/mailService";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { identifierQuery } from "@/lib/authIdentifiers";
import { generateOtp, otpExpiry } from "@/lib/otp";

// Same response whether or not a pending signup exists — this endpoint used
// to answer 404 "no pending signup" vs 400 "already verified", which told a
// caller exactly which emails/usernames have accounts.
const GENERIC_MESSAGE =
  "If there's a pending signup for that account, a new verification code has been sent.";

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

    const query = identifierQuery(await request.json());
    if (!query) {
      return NextResponse.json(
        { error: "Email or username is required", success: false },
        { status: 400 }
      );
    }

    const user = await userModel.findOne(query.filter);
    if (user && !user.isVerified) {
      const verificationCode = generateOtp();
      user.verifyCode = verificationCode;
      user.verifyCodeExpiry = otpExpiry();
      await user.save();

      await sendEmail({
        email: user.email,
        mailType: "VERIFY",
        otpCode: verificationCode,
      });
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Error in resendOtp route:", error);
    return NextResponse.json(
      { error: "Something went wrong while resending the code. Please try again.", success: false },
      { status: 500 }
    );
  }
}
