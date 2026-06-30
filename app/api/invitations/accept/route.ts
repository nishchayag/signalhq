import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import InvitationModel from "@/models/invitation.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import TeamModel from "@/models/team.model";
import UserModel from "@/models/user.model";
import { acceptInvitationSchema } from "@/schemas/invitationSchema";

// POST /api/invitations/accept — authenticated user accepts an invite by token.
// Works for both brand-new accounts (they sign up first) and existing accounts.
export async function POST(request: NextRequest) {
  await connectDB();

  const session = await getServerSession(authOptions);
  if (!session?.user?._id) {
    return NextResponse.json(
      { success: false, message: "Please log in to accept this invitation" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const result = acceptInvitationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input" },
      { status: 400 }
    );
  }

  const invitation = await InvitationModel.findOne({ token: result.data.token });
  if (!invitation) {
    return NextResponse.json(
      { success: false, message: "Invitation not found" },
      { status: 404 }
    );
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json(
      { success: false, message: "This invitation is no longer valid" },
      { status: 409 }
    );
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    invitation.status = "EXPIRED";
    await invitation.save();
    return NextResponse.json(
      { success: false, message: "This invitation has expired" },
      { status: 410 }
    );
  }

  // The invite is bound to a specific email. Ensure the logged-in account
  // matches it so a leaked link can't be redeemed by the wrong person.
  const user = await UserModel.findById(session.user._id).select("email");
  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json(
      {
        success: false,
        message: `This invitation was sent to ${invitation.email}. Log in with that account to accept.`,
      },
      { status: 403 }
    );
  }

  // Create the membership if it doesn't exist yet (idempotent).
  const existing = await MembershipModel.findOne({
    organizationId: invitation.organizationId,
    userId: user._id,
  });
  if (!existing) {
    await MembershipModel.create({
      organizationId: invitation.organizationId,
      userId: user._id,
      role: invitation.role,
    });
  }

  // Add to the invited team, if any.
  if (invitation.teamId) {
    await TeamModel.updateOne(
      { _id: invitation.teamId, organizationId: invitation.organizationId },
      { $addToSet: { members: user._id } }
    );
  }

  invitation.status = "ACCEPTED";
  await invitation.save();

  const organization = await OrganizationModel.findById(
    invitation.organizationId
  ).select("name slug");

  return NextResponse.json(
    {
      success: true,
      message: "Invitation accepted",
      organization: organization
        ? {
            _id: String(organization._id),
            name: organization.name,
            slug: organization.slug,
          }
        : null,
    },
    { status: 200 }
  );
}
