import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import IntegrationModel from "@/models/integration.model";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { can } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/auditLog";
import { hasFeature } from "@/lib/plans";
import { createIntegrationSchema } from "@/schemas/integrationSchema";
import { INTEGRATION_EVENTS, INTEGRATION_MAX_PER_ORG } from "@/lib/integrationConstants";
import {
  generateWebhookSecret,
  integrationView,
  sealSecret,
  sealTargetUrl,
  secretHintOf,
} from "@/lib/integrations";
import { integrationsKeyConfigured } from "@/lib/secretBox";
import { UrlNotAllowedError, validateTargetUrl } from "@/lib/safeHttp";

const notFound = () =>
  NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

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

const urlNotAllowed = (message?: string) =>
  NextResponse.json(
    { success: false, message: message ?? "That URL is not allowed", code: "URL_NOT_ALLOWED" },
    { status: 400 }
  );

// GET /api/organizations/:orgId/integrations — list (any member). Secrets
// and target URLs are select:false on the model, so they're never loaded
// here at all, let alone returned.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const org = await OrganizationModel.findById(orgId).select("plan");
  if (!org) return notFound();

  const integrations = await IntegrationModel.find({ organizationId: orgId }).sort({
    createdAt: 1,
  });

  return NextResponse.json({
    success: true,
    integrations: integrations.map(integrationView),
    allowed: hasFeature(org.plan, "integrations"),
    canManage: can(auth.membership.role, "org:integrations"),
  });
}

// POST /api/organizations/:orgId/integrations — create a Slack or webhook
// integration. OWNER/ADMIN, PRO+, capped at INTEGRATION_MAX_PER_ORG.
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:integrations");
  if (!auth.ok) return auth.response;

  if (!integrationsKeyConfigured()) return unavailable();

  const org = await OrganizationModel.findById(orgId).select("plan");
  if (!org) return notFound();
  if (!hasFeature(org.plan, "integrations")) return planGate();

  const allowed = await checkRateLimit(`integrationCreate:${auth.userId}`, 20, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: "Too many integrations created. Please try again later." },
      { status: 429 }
    );
  }

  const currentCount = await IntegrationModel.countDocuments({ organizationId: orgId });
  if (currentCount >= INTEGRATION_MAX_PER_ORG) {
    return NextResponse.json(
      {
        success: false,
        message: `An organization can have at most ${INTEGRATION_MAX_PER_ORG} integrations.`,
        code: "LIMIT",
      },
      { status: 409 }
    );
  }

  const parsed = createIntegrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: parsed.error.format() },
      { status: 400 }
    );
  }
  const { kind, name, url: rawUrl, payloadMode, events } = parsed.data;

  let url: URL;
  try {
    url = validateTargetUrl(rawUrl, kind);
  } catch (err) {
    return urlNotAllowed(err instanceof UrlNotAllowedError ? err.message : undefined);
  }

  // Generated up front so the AAD (which binds org + integration id + field)
  // is fixed before either secret is sealed.
  const _id = new mongoose.Types.ObjectId();
  const targetUrlEnc = sealTargetUrl(orgId, String(_id), url.toString());

  let secretEnc: string | undefined;
  let secretHint: string | undefined;
  let signingSecret: string | undefined;
  if (kind === "webhook") {
    signingSecret = generateWebhookSecret();
    secretEnc = sealSecret(orgId, String(_id), signingSecret);
    secretHint = secretHintOf(signingSecret);
  }

  const integration = await IntegrationModel.create({
    _id,
    organizationId: orgId,
    kind,
    name,
    payloadMode: payloadMode ?? "full",
    events: events ?? [...INTEGRATION_EVENTS],
    targetHost: url.hostname,
    targetUrlEnc,
    ...(secretEnc && { secretEnc, secretHint }),
    createdBy: auth.userId,
  });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "integration.created",
    metadata: { kind, host: url.hostname, name },
  });

  return NextResponse.json(
    {
      success: true,
      integration: integrationView(integration),
      ...(signingSecret && { signingSecret }),
    },
    { status: 201 }
  );
}

export const GET = withErrorHandling(handleGET);
export const POST = withErrorHandling(handlePOST);
