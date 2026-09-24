import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import { updateNotificationPreferenceSchema } from "@/schemas/notificationSchema";
import { isAiEnabled } from "@/lib/ai";

// GET /api/account/notifications — the caller's current notification
// preference, their digest AI-summary setting, whether AI is configured at
// all (`aiAvailable` false → the UI hides the AI toggle), and per-org mute
// state for each of their memberships (oldest first):
//   orgs: [{ organizationId, name, role, muted }]
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

    const [user, memberships] = await Promise.all([
      UserModel.findById(session.user._id).select("notificationPreference aiDigestSummary"),
      MembershipModel.find({ userId: session.user._id })
        .sort({ createdAt: 1 })
        .select("organizationId role notificationsMuted")
        .lean(),
    ]);
    const names = new Map(
      (
        await OrganizationModel.find({
          _id: { $in: memberships.map((m) => m.organizationId) },
        })
          .select("name")
          .lean()
      ).map((o) => [String(o._id), o.name as string])
    );

    return NextResponse.json({
      success: true,
      notificationPreference: user?.notificationPreference ?? "daily",
      aiDigestSummary: user?.aiDigestSummary !== false,
      aiAvailable: isAiEnabled(),
      // Memberships whose org is gone (mid-cleanup orphans) are skipped.
      orgs: memberships
        .filter((m) => names.has(String(m.organizationId)))
        .map((m) => ({
          organizationId: String(m.organizationId),
          name: names.get(String(m.organizationId)),
          role: m.role,
          muted: m.notificationsMuted === true,
        })),
    });
  } catch (error) {
    console.error("Error fetching notification preference:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/account/notifications — update any of: the caller's
// notification preference, digest AI-summary setting, and per-org mute
// (`mutedOrgs: { [organizationId]: boolean }`, each id must be one of the
// caller's orgs — otherwise 400 and nothing is changed).
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }
    const result = updateNotificationPreferenceSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Invalid input", errors: result.error.format() },
        { status: 400 }
      );
    }

    const { notificationPreference, aiDigestSummary, mutedOrgs } = result.data;
    const userId = session.user._id;

    // Validate every org id before writing anything.
    const muteEntries = Object.entries(mutedOrgs ?? {});
    if (muteEntries.length > 0) {
      const owned = await MembershipModel.countDocuments({
        userId,
        organizationId: { $in: muteEntries.map(([id]) => id) },
      });
      if (owned !== muteEntries.length) {
        return NextResponse.json(
          { success: false, message: "Unknown organization" },
          { status: 400 }
        );
      }
    }

    if (notificationPreference !== undefined || aiDigestSummary !== undefined) {
      await UserModel.findByIdAndUpdate(userId, {
        ...(notificationPreference !== undefined && { notificationPreference }),
        ...(aiDigestSummary !== undefined && { aiDigestSummary }),
      });
    }
    if (muteEntries.length > 0) {
      await MembershipModel.bulkWrite(
        muteEntries.map(([organizationId, muted]) => ({
          updateOne: {
            filter: { userId, organizationId },
            update: { $set: { notificationsMuted: muted } },
          },
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notification preference:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
