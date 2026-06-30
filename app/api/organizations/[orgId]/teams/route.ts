import { NextRequest, NextResponse } from "next/server";
import TeamModel from "@/models/team.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { createTeamSchema } from "@/schemas/teamSchema";
import { uniqueSlug } from "@/lib/slug";

// GET /api/organizations/:orgId/teams — list teams (any member).
export async function GET(
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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "team:create");
  if (!auth.ok) return auth.response;

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

  return NextResponse.json(
    {
      success: true,
      message: "Team created",
      team: { _id: team._id, name: team.name, slug: team.slug },
    },
    { status: 201 }
  );
}
