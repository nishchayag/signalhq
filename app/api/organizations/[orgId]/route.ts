import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import OrgAssetModel from "@/models/orgAsset.model";
import { renameOrganizationSchema } from "@/schemas/organizationSchema";
import { requireOrgAccess } from "@/lib/apiAuth";
import { logActivity } from "@/lib/auditLog";
import { deleteOrganizationsCascade, rehomeStrandedUsers } from "@/lib/orgCleanup";
import { withErrorHandling } from "@/lib/apiHandler";
import { brandingView } from "@/lib/branding";
import { hasFeature } from "@/lib/plans";

// GET /api/organizations/:orgId — details for a member. Branding settings
// (accent/welcomeText/logoVersion) are included here rather than behind
// their own GET route — they aren't secret to members, and the org settings
// page already loads this on every visit. Never selects/returns logo bytes
// (those live in a separate OrgAsset row); the settings UI previews the
// logo via the public GET /api/o/:orgSlug/logo route instead.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const organization = await OrganizationModel.findById(orgId).select(
    "name slug createdBy createdAt plan branding"
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

  // Whether an OrgAsset logo row exists — never selects `bytes` (select:
  // false on the schema already guards that, but `.exists()` never pulls
  // fields at all). This is what the settings UI should key "a logo exists"
  // on, not `branding.logoVersion > 0`, since the version is bumped on
  // delete too (see the logo route) and would otherwise keep pointing the
  // preview/public <img> at a URL that 404s after a removal.
  const hasLogo = !!(await OrgAssetModel.exists({ organizationId: orgId, kind: "logo" }));

  return NextResponse.json(
    {
      success: true,
      organization,
      role: auth.membership.role,
      memberCount,
      branding: brandingView(organization),
      brandingAllowed: hasFeature(organization.plan, "branding"),
      hasLogo,
    },
    { status: 200 }
  );
}

// PATCH /api/organizations/:orgId — rename (OWNER only; slug is immutable).
async function handlePATCH(
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
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:delete");
  if (!auth.ok) return auth.response;

  await connectDB();

  // Deleting your only org would leave you with no membership at all —
  // resolveActiveContext returns null and the whole dashboard 401s.
  const callerMemberships = await MembershipModel.countDocuments({ userId: auth.userId });
  if (callerMemberships <= 1) {
    return NextResponse.json(
      {
        success: false,
        message:
          "You can't delete your only organization. Create or join another one first, or delete your account instead.",
      },
      { status: 409 }
    );
  }

  const organization = await OrganizationModel.findById(orgId).select("name slug");
  const otherMemberIds = (
    await MembershipModel.find({ organizationId: orgId, userId: { $ne: auth.userId } }).select("userId")
  ).map((m) => m.userId);

  // Cascade: remove org-owned data. Messages/questions created before the
  // multi-tenant migration that still lack an org are left untouched.
  await deleteOrganizationsCascade([orgId]);

  // Other members may have had this as their only org (e.g. they
  // transferred away their own). Don't strand them — give them a fresh
  // personal org rather than blocking the owner's delete.
  await rehomeStrandedUsers(otherMemberIds);

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

export const GET = withErrorHandling(handleGET);
export const PATCH = withErrorHandling(handlePATCH);
export const DELETE = withErrorHandling(handleDELETE);
