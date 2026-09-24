import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiHandler";
import { isAiEnabled } from "@/lib/ai";
import { getOrgPlan, quotaStatus } from "@/lib/aiQuota";
import { can } from "@/lib/permissions";

// GET /api/organizations/:orgId/ai — AI availability, this month's usage per
// feature, and which AI controls this member's role may use. Drives dashboard
// gating (components fetch this once per active org and hide/disable AI
// controls based on it) rather than every AI route re-deriving the same
// checks. Returns 200 with enabled:false when there's no provider key, so the
// dashboard can render its "AI not configured" state instead of an error.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const enabled = isAiEnabled();
  const role = auth.membership.role;
  const can_ = {
    suggest: can(role, "question:create"),
    insights: can(role, "ai:insights"),
    draft: can(role, "message:reply"),
    viewSafety: can(role, "ai:viewSafety"),
    search: can(role, "message:read"),
  };

  if (!enabled) {
    return NextResponse.json({ enabled: false, can: can_ }, { status: 200 });
  }

  const plan = await getOrgPlan(orgId);
  const { usage, resetsAt } = await quotaStatus(orgId, plan);

  return NextResponse.json(
    { enabled: true, usage, resetsAt, can: can_ },
    { status: 200 }
  );
}

export const GET = withErrorHandling(handleGET);
