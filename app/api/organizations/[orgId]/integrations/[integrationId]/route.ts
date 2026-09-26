import { NextRequest, NextResponse } from "next/server";
import IntegrationModel, { type IIntegration } from "@/models/integration.model";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { isValidObjectId } from "@/lib/objectId";
import { logActivity } from "@/lib/auditLog";
import { hasFeature } from "@/lib/plans";
import { updateIntegrationSchema } from "@/schemas/integrationSchema";
import { integrationView, sealTargetUrl } from "@/lib/integrations";
import { integrationsKeyConfigured } from "@/lib/secretBox";
import { UrlNotAllowedError, validateTargetUrl } from "@/lib/safeHttp";

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

const urlNotAllowed = (message?: string) =>
  NextResponse.json(
    { success: false, message: message ?? "That URL is not allowed", code: "URL_NOT_ALLOWED" },
    { status: 400 }
  );

async function loadIntegration(
  orgId: string,
  integrationId: string
): Promise<(IIntegration & { _id: unknown }) | null> {
  if (!isValidObjectId(integrationId)) return null;
  return IntegrationModel.findOne({ _id: integrationId, organizationId: orgId });
}

// PATCH /api/organizations/:orgId/integrations/:integrationId — OWNER/ADMIN,
// PRO+ (same posture as branding: a downgrade blocks further edits without
// deleting the stored config). A new `url` is re-validated and re-sealed. A
// `PATCH` re-enabling a disabled integration resets its failure counter.
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; integrationId: string }> }
) {
  const { orgId, integrationId } = await params;
  const auth = await requireOrgAccess(orgId, "org:integrations");
  if (!auth.ok) return auth.response;

  if (!integrationsKeyConfigured()) return unavailable();

  // The integration lookup (scoped to this org) comes before the plan gate:
  // a cross-org id must 404 regardless of this org's plan, not leak a
  // PLAN_UPGRADE_REQUIRED for an object that isn't even here.
  const integration = await loadIntegration(orgId, integrationId);
  if (!integration) return notFound();

  const org = await OrganizationModel.findById(orgId).select("plan");
  if (!org) return notFound();
  if (!hasFeature(org.plan, "integrations")) return planGate();

  const parsed = updateIntegrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: parsed.error.format() },
      { status: 400 }
    );
  }
  const { name, enabled, payloadMode, events, url: rawUrl } = parsed.data;

  const changedFields: string[] = [];
  const set: Record<string, unknown> = {};

  if (name !== undefined) {
    set.name = name;
    changedFields.push("name");
  }
  if (payloadMode !== undefined) {
    set.payloadMode = payloadMode;
    changedFields.push("payloadMode");
  }
  if (events !== undefined) {
    set.events = events;
    changedFields.push("events");
  }
  if (rawUrl !== undefined) {
    let url: URL;
    try {
      url = validateTargetUrl(rawUrl, integration.kind);
    } catch (err) {
      return urlNotAllowed(err instanceof UrlNotAllowedError ? err.message : undefined);
    }
    set.targetHost = url.hostname;
    set.targetUrlEnc = sealTargetUrl(orgId, String(integration._id), url.toString());
    changedFields.push("url");
  }

  const update: Record<string, unknown> = { $set: set };
  if (enabled !== undefined) {
    set.enabled = enabled;
    changedFields.push("enabled");
    if (enabled) {
      // Re-enabling is a fresh start: clear the failure count and any
      // auto-disable marker so a flapping integration isn't immediately
      // re-disabled by a stale counter.
      set.consecutiveFailures = 0;
      update.$unset = { disabledAt: "", disabledReason: "" };
    }
  }

  const updated = await IntegrationModel.findOneAndUpdate(
    { _id: integrationId, organizationId: orgId },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) return notFound();

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "integration.updated",
    metadata: {
      kind: updated.kind,
      host: updated.targetHost,
      name: updated.name,
      changedFields,
    },
  });

  return NextResponse.json({ success: true, integration: integrationView(updated) });
}

// DELETE /api/organizations/:orgId/integrations/:integrationId — OWNER/ADMIN.
// Always allowed regardless of plan (removing config, not using a gated
// feature) — mirrors deleting a team or a label on a downgraded org.
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; integrationId: string }> }
) {
  const { orgId, integrationId } = await params;
  const auth = await requireOrgAccess(orgId, "org:integrations");
  if (!auth.ok) return auth.response;

  const integration = await loadIntegration(orgId, integrationId);
  if (!integration) return notFound();

  await IntegrationModel.deleteOne({ _id: integrationId, organizationId: orgId });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "integration.deleted",
    metadata: { kind: integration.kind, host: integration.targetHost, name: integration.name },
  });

  return NextResponse.json({ success: true });
}

export const PATCH = withErrorHandling(handlePATCH);
export const DELETE = withErrorHandling(handleDELETE);
