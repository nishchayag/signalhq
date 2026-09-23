import { NextRequest, NextResponse } from "next/server";
import TeamModel from "@/models/team.model";
import OrganizationModel from "@/models/organization.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { createTeamSchema } from "@/schemas/teamSchema";
import { uniqueSlug } from "@/lib/slug";
import { teamLimitReached, PLAN_LIMITS } from "@/lib/plans";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";

// GET /api/organizations/:orgId/teams — list teams (any member).
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const teams = await TeamModel.find({ organizationId: orgId })
    .sort({ createdAt: 1 })
    .select("name slug members createdAt");

  const shaped = teams.map((t) => ({
    _id: String(t._id),
    name: t.name,
    slug: t.slug,
    memberCount: t.members?.length ?? 0,
    isMember: (t.members || []).some((m) => String(m) === auth.userId),
    createdAt: t.createdAt,
  }));

  return NextResponse.json({ success: true, teams: shaped }, { status: 200 });
}

// POST /api/organizations/:orgId/teams — create a team.
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "team:create");
  if (!auth.ok) return auth.response;

  const organization = await OrganizationModel.findById(orgId).select("plan");
  const currentTeamCount = await TeamModel.countDocuments({
    organizationId: orgId,
  });
  if (
    organization &&
    teamLimitReached(organization.plan, currentTeamCount)
  ) {
    const limit = PLAN_LIMITS[organization.plan].maxTeams;
    return NextResponse.json(
      {
        success: false,
        message: `Your ${organization.plan} plan allows up to ${limit} team${
          limit === 1 ? "" : "s"
        }. Upgrade to create more.`,
      },
      { status: 403 }
    );
  }

  const body = await request.json();
  const result = createTeamSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  const slug = await uniqueSlug(result.data.name, TeamModel, {
    organizationId: orgId,
  });

  const team = await TeamModel.create({
    organizationId: orgId,
    name: result.data.name,
    slug,
    createdBy: auth.userId,
    members: [auth.userId],
  });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "team.created",
    metadata: { teamId: String(team._id), name: team.name },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Team created",
      team: { _id: team._id, name: team.name, slug: team.slug },
    },
    { status: 201 }
  );
}

export const GET = withErrorHandling(handleGET);
export const POST = withErrorHandling(handlePOST);
