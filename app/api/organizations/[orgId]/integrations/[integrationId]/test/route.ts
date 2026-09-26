import { NextRequest, NextResponse } from "next/server";
import IntegrationModel from "@/models/integration.model";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { isValidObjectId } from "@/lib/objectId";
import { checkRateLimit } from "@/lib/rateLimit";
import { hasFeature } from "@/lib/plans";
import { sendTestEvent } from "@/lib/webhooks";
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

// POST /api/organizations/:orgId/integrations/:integrationId/test —
// OWNER/ADMIN, PRO+. Sends a fixed sample event and reports a coarse result
// only ({ok, status, httpStatus?}) — never the target URL or secret.
// Rate-limited per integration (5/min) since this is a real outbound call.
async function handlePOST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; integrationId: string }> }
) {
  const { orgId, integrationId } = await params;
  const auth = await requireOrgAccess(orgId, "org:integrations");
  if (!auth.ok) return auth.response;

  if (!integrationsKeyConfigured()) return unavailable();

  if (!isValidObjectId(integrationId)) return notFound();

  // Integration lookup (scoped to this org) before the plan gate: a
  // cross-org id 404s regardless of this org's plan.
  const integration = await IntegrationModel.findOne({
    _id: integrationId,
    organizationId: orgId,
  }).select("+targetUrlEnc +secretEnc");
  if (!integration) return notFound();

  const org = await OrganizationModel.findById(orgId).select("plan");
  if (!org) return notFound();
  if (!hasFeature(org.plan, "integrations")) return planGate();

  const allowed = await checkRateLimit(`integrationTest:${integrationId}`, 5, 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: "Too many test sends. Please try again shortly." },
      { status: 429 }
    );
  }

  const result = await sendTestEvent(integration);

  // Best-effort bookkeeping so the settings UI's "last delivery status"
  // reflects test sends too. Never touches consecutiveFailures/auto-disable
  // — a failed test (e.g. a typo'd URL while configuring) shouldn't count
  // toward disabling an otherwise-healthy integration.
  await IntegrationModel.updateOne(
    { _id: integrationId },
    {
      $set: {
        lastAttemptAt: new Date(),
        lastStatus: result.status,
        ...(result.httpStatus !== undefined && { lastHttpStatus: result.httpStatus }),
        ...(result.ok && { lastSuccessAt: new Date() }),
      },
      // A network-level failure (no HTTP response at all) has no
      // httpStatus of its own — clear any stale one from an earlier
      // attempt so the UI doesn't misreport "HTTP error (200)" for an
      // unreachable target (see lib/webhooks.ts#recordFailure).
      ...(result.httpStatus === undefined && !result.ok && { $unset: { lastHttpStatus: "" } }),
    }
  ).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}

export const POST = withErrorHandling(handlePOST);
