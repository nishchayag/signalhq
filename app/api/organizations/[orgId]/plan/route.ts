import { NextRequest, NextResponse } from "next/server";
import OrganizationModel from "@/models/organization.model";
import TeamModel from "@/models/team.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { updatePlanSchema } from "@/schemas/organizationSchema";
import { PLAN_LIMITS } from "@/lib/plans";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";

// PATCH /api/organizations/:orgId/plan — switch the org's billing tier.
// No payment processing exists yet (every plan is free during early
// access) — this is instant self-service, OWNER only. A downgrade is
// blocked if the org's current team count would exceed the new plan's limit.
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:billing");
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const result = updatePlanSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const { plan } = result.data;
  const newLimit = PLAN_LIMITS[plan].maxTeams;
  if (newLimit !== null) {
    const currentTeamCount = await TeamModel.countDocuments({
      organizationId: orgId,
    });
    if (currentTeamCount > newLimit) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${currentTeamCount} teams; the ${plan} plan allows up to ${newLimit}. Delete some teams first.`,
        },
        { status: 400 }
      );
    }
  }

  const previous = await OrganizationModel.findById(orgId).select("plan");
  const organization = await OrganizationModel.findByIdAndUpdate(
    orgId,
    { plan },
    { new: true }
  ).select("plan");

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "organization.plan_changed",
    metadata: { from: previous?.plan, to: plan },
  });

  return NextResponse.json(
    { success: true, message: "Plan updated", organization },
    { status: 200 }
  );
}

export const PATCH = withErrorHandling(handlePATCH);
