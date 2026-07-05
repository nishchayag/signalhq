import { NextRequest, NextResponse } from "next/server";
import MembershipModel from "@/models/membership.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { transferOwnershipSchema } from "@/schemas/organizationSchema";
import { logActivity } from "@/lib/auditLog";

// PATCH /api/organizations/:orgId/transfer-ownership — hand the OWNER role to
// another member of the org. The current owner is demoted to ADMIN in the
// same request so the org always has exactly one owner.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:transferOwnership");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const result = transferOwnershipSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const { membershipId } = result.data;
  if (membershipId === String(auth.membership._id)) {
    return NextResponse.json(
      { success: false, message: "You already own this organization" },
      { status: 400 }
    );
  }

  const target = await MembershipModel.findOne({
    _id: membershipId,
    organizationId: orgId,
  });
  if (!target) {
    return NextResponse.json(
      { success: false, message: "Member not found" },
      { status: 404 }
    );
  }

  // Owner-to-OWNER first, so a failure between the two writes never leaves
  // the org with zero owners (worst case is briefly two).
  target.role = "OWNER";
  await target.save();

  auth.membership.role = "ADMIN";
  await auth.membership.save();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "organization.ownership_transferred",
    metadata: { toUserId: String(target.userId) },
  });

  return NextResponse.json(
    { success: true, message: "Ownership transferred" },
    { status: 200 }
  );
}
