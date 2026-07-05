import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import InvitationModel from "@/models/invitation.model";
import { renameOrganizationSchema } from "@/schemas/organizationSchema";
import { requireOrgAccess } from "@/lib/apiAuth";
import { logActivity } from "@/lib/auditLog";

// GET /api/organizations/:orgId — details for a member.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const organization = await OrganizationModel.findById(orgId).select(
    "name slug createdBy createdAt plan"
  );
  if (!organization) {
    return NextResponse.json(
      { success: false, message: "Organization not found" },
      { status: 404 }
    );
  }

  const memberCount = await MembershipModel.countDocuments({
    organizationId: orgId,
  });

  return NextResponse.json(
    {
      success: true,
      organization,
      role: auth.membership.role,
      memberCount,
    },
    { status: 200 }
  );
}

// PATCH /api/organizations/:orgId — rename (OWNER only; slug is immutable).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:rename");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const result = renameOrganizationSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const previous = await OrganizationModel.findById(orgId).select("name");
  const organization = await OrganizationModel.findByIdAndUpdate(
    orgId,
    { name: result.data.name },
    { new: true }
  ).select("name slug");

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "organization.renamed",
    metadata: { from: previous?.name, to: result.data.name },
  });

  return NextResponse.json(
    { success: true, message: "Organization renamed", organization },
    { status: 200 }
  );
}

// DELETE /api/organizations/:orgId — delete org and all its data (OWNER only).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:delete");
  if (!auth.ok) return auth.response;

  await connectDB();
  const organization = await OrganizationModel.findById(orgId).select("name slug");

  // Cascade: remove org-owned data. Messages/questions created before the
  // multi-tenant migration that still lack an org are left untouched.
  await Promise.all([
    MessageModel.deleteMany({ organizationId: orgId }),
    QuestionModel.deleteMany({ organizationId: orgId }),
    TeamModel.deleteMany({ organizationId: orgId }),
    InvitationModel.deleteMany({ organizationId: orgId }),
    MembershipModel.deleteMany({ organizationId: orgId }),
  ]);
  await OrganizationModel.findByIdAndDelete(orgId);

  // Logged after the cascade so the org itself is dangling by the time this
  // entry exists — metadata carries the name/slug since they won't be
  // joinable afterward. The entry is orphaned (no membership left to gate
  // access to it), kept anyway as a durable record of the deletion.
  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "organization.deleted",
    metadata: { name: organization?.name, slug: organization?.slug },
  });

  return NextResponse.json(
    { success: true, message: "Organization deleted" },
    { status: 200 }
  );
}
