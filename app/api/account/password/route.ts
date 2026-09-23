import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import { checkRateLimit } from "@/lib/rateLimit";
import UserModel from "@/models/user.model";
import { changePasswordSchema } from "@/schemas/accountSchema";

/**
 * POST /api/account/password — change password, current one re-confirmed.
 * Bumps tokenVersion, which signs out EVERY session including the caller's;
 * the client re-signs-in its own session with the new password afterwards.
 */
export async function POST(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Per user: a hijacked session can't brute-force the current password.
    const allowed = await checkRateLimit(
      `changePassword:${session.user._id}`,
      5,
      10 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          message: "Too many attempts. Please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const result = changePasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error.issues[0]?.message ?? "Invalid input",
          errors: result.error.format(),
        },
        { status: 400 }
      );
    }
    const { currentPassword, newPassword } = result.data;

    const user = await UserModel.findById(session.user._id);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect" },
        { status: 403 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return NextResponse.json({ success: true, message: "Password changed" });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
