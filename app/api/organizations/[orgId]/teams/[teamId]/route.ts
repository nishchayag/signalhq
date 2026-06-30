import { NextRequest, NextResponse } from "next/server";
import TeamModel from "@/models/team.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { updateTeamSchema } from "@/schemas/teamSchema";

interface PopulatedUser {
  _id: string;
  name: string;
  username: string;
}

// GET /api/organizations/:orgId/teams/:teamId — team details + members.
export async function GET(
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
export async function PATCH(
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

  if (result.data.memberIds !== undefined) {
    // Only users who are actually org members may be on a team.
    const valid = await MembershipModel.find({
      organizationId: orgId,
      userId: { $in: result.data.memberIds },
    }).select("userId");
    team.members = valid.map((m) => m.userId);
  }

  await team.save();

  return NextResponse.json(
    { success: true, message: "Team updated" },
    { status: 200 }
  );
}

// DELETE /api/organizations/:orgId/teams/:teamId — delete team; its questions
// and messages fall back to org-level (teamId cleared), not deleted.
export async function DELETE(
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

  return NextResponse.json(
    { success: true, message: "Team deleted" },
    { status: 200 }
  );
}
