import { NextRequest, NextResponse } from "next/server";
import InvitationModel from "@/models/invitation.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";

// DELETE /api/organizations/:orgId/invitations/:invitationId — revoke a pending invite.
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; invitationId: string }> }
) {
  const { orgId, invitationId } = await params;
  const auth = await requireOrgAccess(orgId, "member:invite");
  if (!auth.ok) return auth.response;

  const invitation = await InvitationModel.findOne({
    _id: invitationId,
    organizationId: orgId,
  });
  if (!invitation) {
    return NextResponse.json(
      { success: false, message: "Invitation not found" },
      { status: 404 }
    );
  }

  // Only a live invite can be revoked — flipping an ACCEPTED one to REVOKED
  // would rewrite history (the member is already in).
  if (invitation.status !== "PENDING") {
    return NextResponse.json(
      { success: false, message: `This invitation is already ${invitation.status.toLowerCase()}` },
      { status: 409 }
    );
  }

  invitation.status = "REVOKED";
  await invitation.save();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "invitation.revoked",
    metadata: { email: invitation.email },
  });

  return NextResponse.json(
    { success: true, message: "Invitation revoked" },
    { status: 200 }
  );
}

export const DELETE = withErrorHandling(handleDELETE);
