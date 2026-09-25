import { NextRequest, NextResponse } from "next/server";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { logActivity } from "@/lib/auditLog";
import { patchBrandingSchema } from "@/schemas/brandingSchema";
import { moderateContent } from "@/lib/contentModeration";
import { getOrgPlan } from "@/lib/aiQuota";
import { hasFeature } from "@/lib/plans";
import { brandingView } from "@/lib/branding";

const notFound = () =>
  NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

// FREE orgs get a clear, machine-readable code back (not just a message) so
// the future settings UI can show a specific upsell rather than a generic
// error.
const planGate = () =>
  NextResponse.json(
    {
      success: false,
      message: "Branding is available on the Pro plan and up.",
      code: "PLAN_UPGRADE_REQUIRED",
    },
    { status: 403 }
  );

// PATCH /api/organizations/:orgId/branding {accent?, welcomeText?}
// OWNER/ADMIN only (org:branding), and PRO/ENTERPRISE only.
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:branding");
  if (!auth.ok) return auth.response;

  const plan = await getOrgPlan(orgId);
  if (!hasFeature(plan, "branding")) return planGate();

  const parsed = patchBrandingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: parsed.error.format() },
      { status: 400 }
    );
  }
  const { accent, welcomeText } = parsed.data;

  if (welcomeText) {
    const moderation = moderateContent(welcomeText);
    if (!moderation.allowed) {
      return NextResponse.json({ success: false, message: moderation.reason }, { status: 400 });
    }
  }

  const set: Record<string, unknown> = {};
  if (accent !== undefined) set["branding.accent"] = accent;
  if (welcomeText !== undefined) set["branding.welcomeText"] = welcomeText;

  const organization = await OrganizationModel.findByIdAndUpdate(
    orgId,
    { $set: set },
    { new: true, runValidators: true }
  ).select("branding");
  if (!organization) return notFound();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "branding.updated",
    metadata: {
      ...(accent !== undefined && { accent }),
      ...(welcomeText !== undefined && { welcomeTextLength: welcomeText.length }),
    },
  });

  return NextResponse.json({ success: true, branding: brandingView(organization) });
}

export const PATCH = withErrorHandling(handlePATCH);
