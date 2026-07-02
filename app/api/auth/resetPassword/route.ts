import connectDB from "@/lib/connectDB";
import { NextRequest, NextResponse } from "next/server";
import userModel from "@/models/user.model";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/getClientIp";
import { resetPasswordSchema } from "@/schemas/forgotPasswordSchema";

export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(
      `resetPassword:${ip}`,
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
    const result = resetPasswordSchema.safeParse(body);
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

    const { email, otpCode, newPassword } = result.data;
    const user = await userModel.findOne({ email });
    if (
      !user ||
      !user.forgotPasswordCode ||
      !user.forgotPasswordCodeExpiry
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired code" },
        { status: 400 }
      );
    }

    if (user.forgotPasswordCodeExpiry < new Date()) {
      return NextResponse.json(
        {
          success: false,
          message: "This code has expired. Please request a new one.",
        },
        { status: 400 }
      );
    }

    if (user.forgotPasswordCode !== otpCode) {
      return NextResponse.json(
        { success: false, message: "Invalid code" },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.forgotPasswordCode = undefined;
    user.forgotPasswordCodeExpiry = undefined;
    await user.save();

    return NextResponse.json(
      { success: true, message: "Password reset successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in resetPassword route:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
