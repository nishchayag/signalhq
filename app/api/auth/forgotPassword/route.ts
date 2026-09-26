import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import { sendEmail } from "@/lib/mailService";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { generateOtp } from "@/lib/otp";
import { forgotPasswordSchema } from "@/schemas/forgotPasswordSchema";

// Generic response regardless of whether the account exists/is verified —
// this endpoint is a classic enumeration-risk surface (unlike signup, which
// already reveals "email in use").
const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a password reset code.";

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(
      `forgotPassword:${ip}`,
      5,
      10 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many requests. Please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input" },
        { status: 400 }
      );
    }

    const user = await userModel.findOne({ email: result.data.email });
    // Only verified accounts have a usable login to reset — an unverified
    // signup should resend/verify instead, not reset a password.
    if (user && user.isVerified) {
      const code = generateOtp();
      user.forgotPasswordCode = code;
      user.forgotPasswordCodeExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await user.save();

      await sendEmail({
        email: user.email,
        mailType: "RESET",
        otpCode: code,
      });
    }

    return NextResponse.json(
      { success: true, message: GENERIC_MESSAGE },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in forgotPassword route:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
