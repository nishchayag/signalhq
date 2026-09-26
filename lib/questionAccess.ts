import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import QuestionModel, { IQuestion } from "@/models/question.model";
import MembershipModel, { type IMembership } from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import { can, Permission } from "@/lib/permissions";
import { isValidObjectId } from "@/lib/objectId";
import type { MembershipRole } from "@/models/membership.model";

// `role` and `membership` are null for legacy org-less questions (owner-only
// access, no org role).
export type AuthzOk = {
  ok: true;
  question: IQuestion;
  role: MembershipRole | null;
  membership: IMembership | null;
  userId: string;
};
export type AuthzFail = { ok: false; response: NextResponse };

function notFound(message = "Question not found"): AuthzFail {
  return {
    ok: false,
    response: NextResponse.json({ success: false, message }, { status: 404 }),
  };
}

/**
 * Team-scope filter for question list queries. OWNER/ADMIN see everything
 * (returns null, meaning "no team restriction"); a MEMBER sees org-level
 * questions plus those scoped to teams they belong to.
 */
export async function teamScopeFilter(
  orgId: string,
  userId: string,
  role: string
): Promise<Record<string, unknown> | null> {
  if (role === "OWNER" || role === "ADMIN") return null;
  const teams = await TeamModel.find({
    organizationId: orgId,
    members: userId,
  }).select("_id");
  const teamIds = teams.map((t) => t._id);
  return { $or: [{ teamId: null }, { teamId: { $in: teamIds } }] };
}

/**
 * Single-question counterpart of `teamScopeFilter`: may this member see this
 * question? OWNER/ADMIN always; a MEMBER only for org-level questions or
 * questions scoped to a team they belong to.
 */
export async function canAccessQuestion(
  question: { teamId?: unknown },
  userId: string,
  role: MembershipRole | null
): Promise<boolean> {
  if (role === "OWNER" || role === "ADMIN") return true;
  if (!question.teamId) return true;
  const team = await TeamModel.exists({ _id: question.teamId, members: userId });
  return Boolean(team);
}

/**
 * Load a question and authorize the caller against it. Org-owned questions are
 * gated by membership + role permission; legacy questions without an org fall
 * back to owner-only access.
 */
export async function loadAndAuthorize(
  questionId: string,
  permission?: Permission
): Promise<AuthzOk | AuthzFail> {
  const session = await getServerSession(authOptions);
  if (!session?.user?._id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  if (!isValidObjectId(questionId)) return notFound();
  const question = await QuestionModel.findById(questionId);
  if (!question) return notFound();

  let role: MembershipRole | null = null;
  let membership: IMembership | null = null;
  if (question.organizationId) {
    membership = await MembershipModel.findOne({
      organizationId: question.organizationId,
      userId: session.user._id,
    });
    if (!membership) return notFound();
    if (permission && !can(membership.role, permission)) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 }
        ),
      };
    }
    role = membership.role;
    // Membership alone isn't enough: a MEMBER must not read (or export)
    // a question scoped to a team they're not in. 404, not 403, so the
    // question's existence isn't leaked — same as the list endpoint, which
    // never returns it to them at all.
    if (!(await canAccessQuestion(question, String(session.user._id), role))) {
      return notFound();
    }
  } else if (String(question.userId) !== String(session.user._id)) {
    return notFound();
  }

  return { ok: true, question, role, membership, userId: String(session.user._id) };
}
