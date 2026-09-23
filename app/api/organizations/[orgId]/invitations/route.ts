import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import InvitationModel from "@/models/invitation.model";
import UserModel from "@/models/user.model";
import TeamModel from "@/models/team.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { createInvitationSchema } from "@/schemas/invitationSchema";
import { sendInvitationEmail } from "@/lib/mailService";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";

const INVITE_TTL_DAYS = 7;

// GET /api/organizations/:orgId/invitations — pending invites.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "member:invite");
  if (!auth.ok) return auth.response;

  const invitations = await InvitationModel.find({
    organizationId: orgId,
    status: "PENDING",
  })
    .sort({ createdAt: -1 })
    .select("email role teamId status expiresAt createdAt");

  return NextResponse.json({ success: true, invitations }, { status: 200 });
}

// POST /api/organizations/:orgId/invitations — create + email an invite.
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "member:invite");
  if (!auth.ok) return auth.response;

  // Each invite emails an arbitrary third-party address — keyed per inviter
  // (not IP) so one compromised account can't spam from rotating IPs.
  const allowed = await checkRateLimit(
    `createInvitation:${auth.userId}`,
    10,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many invitations sent. Please try again in an hour.",
      },
      { status: 429 }
    );
  }

  const body = await request.json();
  const result = createInvitationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const email = result.data.email.toLowerCase();
  const { role, teamId } = result.data;

  // Already a member? (look up by email → user → membership)
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    const alreadyMember = await MembershipModel.findOne({
      organizationId: orgId,
      userId: existingUser._id,
    });
    if (alreadyMember) {
      return NextResponse.json(
        { success: false, message: "That user is already a member" },
        { status: 409 }
      );
    }
  }

  // Validate optional team belongs to this org.
  if (teamId) {
    const team = await TeamModel.findOne({ _id: teamId, organizationId: orgId });
    if (!team) {
      return NextResponse.json(
        { success: false, message: "Team not found in this organization" },
        { status: 400 }
      );
    }
  }

  const token = nanoid(32);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  // Refresh an existing pending invite instead of colliding on the unique index.
  const invitation = await InvitationModel.findOneAndUpdate(
    { organizationId: orgId, email, status: "PENDING" },
    {
      organizationId: orgId,
      email,
      role,
      teamId: teamId || undefined,
      token,
      status: "PENDING",
      invitedBy: auth.userId,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const organization = await OrganizationModel.findById(orgId).select("name");
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const acceptUrl = `${baseUrl}/invite/${token}`;

  const emailed = await sendInvitationEmail({
    email,
    orgName: organization?.name || "an organization",
    inviterName: auth.session.user.name,
    role,
    acceptUrl,
  });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "invitation.created",
    metadata: { email, role, teamId },
  });

  return NextResponse.json(
    {
      success: true,
      message: emailed
        ? "Invitation sent"
        : "Invitation created, but the email could not be sent",
      emailed,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    },
    { status: 201 }
  );
}

export const GET = withErrorHandling(handleGET);
export const POST = withErrorHandling(handlePOST);
