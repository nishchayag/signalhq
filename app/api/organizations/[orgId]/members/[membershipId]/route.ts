import { NextRequest, NextResponse } from "next/server";
import MembershipModel from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { outranks } from "@/lib/permissions";
import { updateMemberRoleSchema } from "@/schemas/memberSchema";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";

// PATCH /api/organizations/:orgId/members/:membershipId — change a role.
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId, membershipId } = await params;
  const auth = await requireOrgAccess(orgId, "member:role");
  if (!auth.ok) return auth.response;

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
  // Owners are managed only through ownership transfer, not this endpoint.
  if (target.role === "OWNER") {
    return NextResponse.json(
      { success: false, message: "Cannot change an owner's role" },
      { status: 403 }
    );
  }
  // You may only act on members you strictly outrank.
  if (!outranks(auth.membership.role, target.role)) {
    return NextResponse.json(
      { success: false, message: "Insufficient permissions for this member" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const result = updateMemberRoleSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const previousRole = target.role;
  target.role = result.data.role;
  await target.save();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "member.role_changed",
    metadata: {
      targetUserId: String(target.userId),
      from: previousRole,
      to: target.role,
    },
  });

  return NextResponse.json(
    { success: true, message: "Role updated", role: target.role },
    { status: 200 }
  );
}

// DELETE /api/organizations/:orgId/members/:membershipId — remove a member.
// A non-owner member may also remove *themselves* (leave the org).
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId, membershipId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

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

  if (target.role === "OWNER") {
    return NextResponse.json(
      { success: false, message: "Owners cannot be removed" },
      { status: 403 }
    );
  }

  const isSelf = String(target.userId) === auth.userId;
  const allowed =
    isSelf ||
    (auth.membership.role !== "MEMBER" &&
      outranks(auth.membership.role, target.role));
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: "Insufficient permissions" },
      { status: 403 }
    );
  }

  await MembershipModel.deleteOne({ _id: target._id });
  // Drop them from any teams in this org.
  await TeamModel.updateMany(
    { organizationId: orgId },
    { $pull: { members: target.userId } }
  );

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: isSelf ? "member.left" : "member.removed",
    metadata: { targetUserId: String(target.userId), role: target.role },
  });

  return NextResponse.json(
    { success: true, message: isSelf ? "Left organization" : "Member removed" },
    { status: 200 }
  );
}

export const PATCH = withErrorHandling(handlePATCH);
export const DELETE = withErrorHandling(handleDELETE);
