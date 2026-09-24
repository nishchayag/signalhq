import { NextRequest, NextResponse } from "next/server";
import TeamModel from "@/models/team.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { updateTeamSchema } from "@/schemas/teamSchema";
import { logActivity } from "@/lib/auditLog";
import { withErrorHandling } from "@/lib/apiHandler";
import { unassignUser } from "@/lib/orgCleanup";

interface PopulatedUser {
  _id: string;
  name: string;
  username: string;
}

// GET /api/organizations/:orgId/teams/:teamId — team details + members.
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; teamId: string }> }
) {
  const { orgId, teamId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const team = await TeamModel.findOne({ _id: teamId, organizationId: orgId })
    .populate<{ members: PopulatedUser[] }>("members", "name username");
  if (!team) {
    return NextResponse.json(
      { success: false, message: "Team not found" },
      { status: 404 }
    );
  }

  const members = (team.members as unknown as PopulatedUser[]).map((u) => ({
    userId: String(u._id),
    name: u.name,
    username: u.username,
  }));

  return NextResponse.json(
    {
      success: true,
      team: { _id: String(team._id), name: team.name, slug: team.slug, members },
    },
    { status: 200 }
  );
}

// PATCH /api/organizations/:orgId/teams/:teamId — rename and/or set members.
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; teamId: string }> }
) {
  const { orgId, teamId } = await params;
  const auth = await requireOrgAccess(orgId, "team:update");
  if (!auth.ok) return auth.response;

  const team = await TeamModel.findOne({ _id: teamId, organizationId: orgId });
  if (!team) {
    return NextResponse.json(
      { success: false, message: "Team not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const result = updateTeamSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { success: false, message: "Invalid input", errors: result.error.format() },
      { status: 400 }
    );
  }

  if (result.data.name !== undefined) team.name = result.data.name;

  let removed: string[] = [];
  if (result.data.memberIds !== undefined) {
    // Only users who are actually org members may be on a team.
    const valid = await MembershipModel.find({
      organizationId: orgId,
      userId: { $in: result.data.memberIds },
    }).select("userId");
    const next = new Set(valid.map((m) => String(m.userId)));
    removed = team.members.map(String).filter((id) => !next.has(id));
    team.members = valid.map((m) => m.userId);
  }

  await team.save();

  // A MEMBER taken off the team loses access to its messages, so unassign
  // them there (OWNER/ADMIN see every team and stay assigned).
  if (removed.length > 0) {
    const members = await MembershipModel.find({
      organizationId: orgId,
      userId: { $in: removed },
      role: "MEMBER",
    }).select("userId");
    for (const m of members) {
      await unassignUser(m.userId, { organizationId: orgId, teamId: team._id });
    }
  }

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "team.updated",
    metadata: { teamId: String(team._id), name: team.name },
  });

  return NextResponse.json(
    { success: true, message: "Team updated" },
    { status: 200 }
  );
}

// DELETE /api/organizations/:orgId/teams/:teamId — delete team; its questions
// and messages fall back to org-level (teamId cleared), not deleted.
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; teamId: string }> }
) {
  const { orgId, teamId } = await params;
  const auth = await requireOrgAccess(orgId, "team:delete");
  if (!auth.ok) return auth.response;

  const team = await TeamModel.findOne({ _id: teamId, organizationId: orgId });
  if (!team) {
    return NextResponse.json(
      { success: false, message: "Team not found" },
      { status: 404 }
    );
  }

  await Promise.all([
    QuestionModel.updateMany({ teamId }, { $unset: { teamId: "" } }),
    MessageModel.updateMany({ teamId }, { $unset: { teamId: "" } }),
  ]);
  await TeamModel.deleteOne({ _id: teamId });

  await logActivity({
    organizationId: orgId,
    actorUserId: auth.userId,
    action: "team.deleted",
    metadata: { teamId, name: team.name },
  });

  return NextResponse.json(
    { success: true, message: "Team deleted" },
    { status: 200 }
  );
}

export const GET = withErrorHandling(handleGET);
export const PATCH = withErrorHandling(handlePATCH);
export const DELETE = withErrorHandling(handleDELETE);
