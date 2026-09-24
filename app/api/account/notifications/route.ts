import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import { updateNotificationPreferenceSchema } from "@/schemas/notificationSchema";
import { isAiEnabled } from "@/lib/ai";

// GET /api/account/notifications — the caller's current notification
// preference, their digest AI-summary setting, and whether AI is configured
// at all (`aiAvailable` false → the UI hides the AI toggle).
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
      "notificationPreference aiDigestSummary"
    );
    return NextResponse.json({
      success: true,
      notificationPreference: user?.notificationPreference ?? "daily",
      aiDigestSummary: user?.aiDigestSummary !== false,
      aiAvailable: isAiEnabled(),
    });
  } catch (error) {
    console.error("Error fetching notification preference:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/account/notifications — update the caller's notification
// preference and/or digest AI-summary setting (either field may be omitted).
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

    const { notificationPreference, aiDigestSummary } = result.data;
    await UserModel.findByIdAndUpdate(session.user._id, {
      ...(notificationPreference !== undefined && { notificationPreference }),
      ...(aiDigestSummary !== undefined && { aiDigestSummary }),
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
