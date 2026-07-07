import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import { updateNotificationPreferenceSchema } from "@/schemas/notificationSchema";

// GET /api/account/notifications — the caller's current notification preference.
export async function GET() {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const user = await UserModel.findById(session.user._id).select(
      "notificationPreference"
    );
    return NextResponse.json({
      success: true,
      notificationPreference: user?.notificationPreference ?? "daily",
    });
  } catch (error) {
    console.error("Error fetching notification preference:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/account/notifications — update the caller's notification preference.
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

    const body = await request.json();
    const result = updateNotificationPreferenceSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    await UserModel.findByIdAndUpdate(session.user._id, {
      notificationPreference: result.data.notificationPreference,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notification preference:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
