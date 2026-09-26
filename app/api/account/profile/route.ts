import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import { updateProfileSchema } from "@/schemas/accountSchema";

/**
 * PATCH /api/account/profile — change the caller's display name. Only the
 * User is touched: the personal org keeps whatever name it has (it's
 * separately renameable). The client follows up with a bare `update()` so
 * the jwt callback re-reads the name from the DB into the session.
 */
export async function PATCH(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const result = updateProfileSchema.safeParse(body);
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

    const user = await UserModel.findByIdAndUpdate(
      session.user._id,
      { name: result.data.name },
      { new: true }
    ).select("name");
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, name: user.name });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
