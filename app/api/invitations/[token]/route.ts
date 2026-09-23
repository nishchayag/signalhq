import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import InvitationModel from "@/models/invitation.model";
import OrganizationModel from "@/models/organization.model";
import { withErrorHandling } from "@/lib/apiHandler";

// GET /api/invitations/:token — public lookup so the accept page can show the
// org name. The token itself is the secret; no membership required.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await connectDB();
  const { token } = await params;

  const invitation = await InvitationModel.findOne({ token });
  if (!invitation) {
    return NextResponse.json(
      { success: false, message: "Invitation not found" },
      { status: 404 }
    );
  }

  const expired = invitation.expiresAt.getTime() < Date.now();
  const valid = invitation.status === "PENDING" && !expired;

  const organization = await OrganizationModel.findById(
    invitation.organizationId
  ).select("name slug");

  return NextResponse.json(
    {
      success: true,
      invitation: {
        email: invitation.email,
        role: invitation.role,
        status: expired && invitation.status === "PENDING" ? "EXPIRED" : invitation.status,
        valid,
        organization: organization
          ? { name: organization.name, slug: organization.slug }
          : null,
      },
    },
    { status: 200 }
  );
}

export const GET = withErrorHandling(handleGET);
