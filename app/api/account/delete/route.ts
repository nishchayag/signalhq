import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import bcrypt from "bcryptjs";
import UserModel from "@/models/user.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import MessageModel from "@/models/message.model";
import { deleteOrganizationsCascade, unassignUser } from "@/lib/orgCleanup";

/**
 * DELETE /api/account/delete — self-service account deletion, password
 * re-confirmed. Blocks if the user is the sole OWNER of an org that has
 * other members (never silently reassigns or destroys another user's
 * access) — they must transfer ownership or remove other members first.
 *
 * Known limitation: Questions/Teams/Invitations the user created inside an
 * org they don't own (as ADMIN/MEMBER) are left in place when they leave —
 * `userId`/`createdBy`/`invitedBy` on those records will point at a deleted
 * user. Reassigning attribution needs an ownership-transfer UI that doesn't
 * exist yet; out of scope for this pass.
 */
export async function DELETE(request: NextRequest) {
  await connectDB();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?._id) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const { password } = await request.json();
    if (!password) {
      return NextResponse.json(
        {
          success: false,
          message: "Password is required to confirm account deletion",
        },
        { status: 400 }
      );
    }

    const user = await UserModel.findById(session.user._id);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Incorrect password" },
        { status: 403 }
      );
    }

    const userId = user._id;

    const ownedMemberships = await MembershipModel.find({
      userId,
      role: "OWNER",
    });

    const blockingOrgs: { _id: string; name: string }[] = [];
    for (const membership of ownedMemberships) {
      const otherMemberCount = await MembershipModel.countDocuments({
        organizationId: membership.organizationId,
        userId: { $ne: userId },
      });
      if (otherMemberCount > 0) {
        const org = await OrganizationModel.findById(
          membership.organizationId
        ).select("name");
        blockingOrgs.push({
          _id: String(membership.organizationId),
          name: org?.name || "Unknown organization",
        });
      }
    }

    if (blockingOrgs.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You're the owner of an organization with other members. Transfer ownership or remove the other members before deleting your account.",
          blockingOrgs,
        },
        { status: 409 }
      );
    }

    // Safe to proceed — every org this user OWNS has no other members, so
    // fully cascade-delete those (mirrors organizations/[orgId]'s DELETE).
    const soleOwnedOrgIds = ownedMemberships.map((m) => m.organizationId);
    await deleteOrganizationsCascade(soleOwnedOrgIds);

    // Orgs the user belongs to but doesn't own: just remove their
    // membership (leave the org) — the org's own data isn't touched.
    await MembershipModel.deleteMany({ userId, role: { $ne: "OWNER" } });
    // …and stop being anyone's assignee there.
    await unassignUser(userId);

    // Legacy pre-migration messages tied directly to this user (no org yet).
    await MessageModel.deleteMany({
      createdFor: userId,
      organizationId: null,
    });

    await UserModel.findByIdAndDelete(userId);

    return NextResponse.json(
      { success: true, message: "Account deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in account delete route:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
