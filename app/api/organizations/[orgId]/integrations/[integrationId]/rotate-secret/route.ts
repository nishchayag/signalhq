import { NextRequest, NextResponse } from "next/server";
import IntegrationModel from "@/models/integration.model";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { isValidObjectId } from "@/lib/objectId";
import { logActivity } from "@/lib/auditLog";
import { hasFeature } from "@/lib/plans";
import { generateWebhookSecret, integrationView, sealSecret, secretHintOf } from "@/lib/integrations";
import { integrationsKeyConfigured } from "@/lib/secretBox";

const notFound = () =>
  NextResponse.json({ success: false, message: "Integration not found" }, { status: 404 });

const planGate = () =>
  NextResponse.json(
    {
      success: false,
      message: "Integrations are available on the Pro plan and up.",
      code: "PLAN_UPGRADE_REQUIRED",
    },
    { status: 403 }
  );

const unavailable = () =>
  NextResponse.json(
    {
      success: false,
      message: "Integrations are not configured on this server.",
      code: "INTEGRATIONS_UNAVAILABLE",
    },
    { status: 503 }
  );

// POST /api/organizations/:orgId/integrations/:integrationId/rotate-secret —
// webhooks only. OWNER/ADMIN, PRO+. Returns the new signing secret once.
async function handlePOST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; integrationId: string }> }
) {
  const { orgId, integrationId } = await params;
  const auth = await requireOrgAccess(orgId, "org:integrations");
  if (!auth.ok) return auth.response;

  if (!integrationsKeyConfigured()) return unavailable();

  // Integration lookup before the plan gate: a cross-org id 404s regardless
  // of this org's plan.
  if (!isValidObjectId(integrationId)) return notFound();
  const integration = await IntegrationModel.findOne({ _id: integrationId, organizationId: orgId });
  if (!integration) return notFound();

  const org = await OrganizationModel.findById(orgId).select("plan");
  if (!org) return notFound();
  if (!hasFeature(org.plan, "integrations")) return planGate();

  if (integration.kind !== "webhook") {
    return NextResponse.json(
      { success: false, message: "Only webhook integrations have a signing secret to rotate" },
      { status: 400 }
    );
  }

  const signingSecret = generateWebhookSecret();
  integration.secretEnc = sealSecret(orgId, String(integration._id), signingSecret);
  integration.secretHint = secretHintOf(signingSecret);
  await integration.save();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "integration.secret_rotated",
    metadata: { kind: integration.kind, host: integration.targetHost, name: integration.name },
  });

  return NextResponse.json({
    success: true,
    integration: integrationView(integration),
    signingSecret,
  });
}

export const POST = withErrorHandling(handlePOST);
