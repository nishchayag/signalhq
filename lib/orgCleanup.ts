import mongoose from "mongoose";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import InvitationModel from "@/models/invitation.model";
import AiUsageModel from "@/models/aiUsage.model";
import AiInsightModel from "@/models/aiInsight.model";
import OrgAssetModel from "@/models/orgAsset.model";
import { createPersonalOrganization } from "@/lib/orgContext";

// Deliberately does NOT import lib/mailService: `new Resend()` throws at
// import time without RESEND_API_KEY, and this module is shared by routes,
// the cron, and tests.

type Id = string | mongoose.Types.ObjectId;

/**
 * Unassign `userId` from every message matching `where` (e.g. one org, or
 * one org's team). Always `$unset` (never null) so the assignee partial
 * index stays "assigned only". Stale `readBy` ids are left alone — they're
 * never exposed and never match another viewer.
 */
export async function unassignUser(
  userId: Id,
  where: Record<string, unknown> = {}
): Promise<number> {
  const res = await MessageModel.updateMany(
    { ...where, assignedTo: userId },
    { $unset: { assignedTo: "", assignedAt: "", assignedBy: "" } }
  );
  return res.modifiedCount;
}

/**
 * Delete organizations and everything they own. Messages/questions created
 * before the multi-tenant migration that still lack an org are untouched.
 * Not transactional (tests run on a standalone Mongo), so children go first
 * and the org documents last — a partial failure leaves an org with fewer
 * children rather than orphaned children with no org.
 */
export async function deleteOrganizationsCascade(orgIds: Id[]): Promise<void> {
  if (orgIds.length === 0) return;
  const filter = { organizationId: { $in: orgIds } };
  await Promise.all([
    MessageModel.deleteMany(filter),
    QuestionModel.deleteMany(filter),
    TeamModel.deleteMany(filter),
    InvitationModel.deleteMany(filter),
    MembershipModel.deleteMany(filter),
    AiUsageModel.deleteMany(filter),
    AiInsightModel.deleteMany(filter),
    OrgAssetModel.deleteMany(filter),
  ]);
  await OrganizationModel.deleteMany({ _id: { $in: orgIds } });
}

/**
 * Remove a user who never finished signing up, along with the personal org
 * signup created for them (any org they created that has no other members)
 * and their memberships. Callers are responsible for only passing users who
 * should be removed (unverified/expired, or a just-created signup rollback).
 */
export async function deleteUnverifiedUser(userId: Id): Promise<void> {
  const createdOrgs = await OrganizationModel.find({ createdBy: userId }).select("_id");
  const soleOrgIds: Id[] = [];
  for (const org of createdOrgs) {
    const others = await MembershipModel.countDocuments({
      organizationId: org._id,
      userId: { $ne: userId },
    });
    if (others === 0) soleOrgIds.push(org._id);
  }
  await deleteOrganizationsCascade(soleOrgIds);
  await MembershipModel.deleteMany({ userId });
  await unassignUser(userId);
  await UserModel.deleteOne({ _id: userId });
}

/**
 * Give any of these users who now have zero memberships (e.g. after an org
 * they belonged to was deleted) a fresh personal org, so the dashboard and
 * resolveActiveContext keep working for them. Returns the ids re-homed.
 */
export async function rehomeStrandedUsers(userIds: Id[]): Promise<string[]> {
  const rehomed: string[] = [];
  for (const userId of userIds) {
    const count = await MembershipModel.countDocuments({ userId });
    if (count > 0) continue;
    const user = await UserModel.findById(userId).select("name username");
    if (!user) continue;
    await createPersonalOrganization({
      _id: user._id,
      name: user.name,
      username: user.username,
    });
    rehomed.push(String(userId));
  }
  return rehomed;
}

// ---- Daily cron sweeps (idempotent; safe to run more than once) ----

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete never-verified signups whose code expired over a day ago, with
 * their personal orgs. verifyEmail only cleaned these up if someone happened
 * to call it after expiry, so they otherwise held their email/username
 * forever. Filters on isVerified: false explicitly — verified users have
 * verifyCodeExpiry unset, but never rely on that alone.
 */
export async function sweepExpiredUnverifiedUsers(limit = 200): Promise<number> {
  const stale = await UserModel.find({
    isVerified: false,
    verifyCodeExpiry: { $lt: new Date(Date.now() - DAY_MS) },
  })
    .select("_id")
    .limit(limit);
  for (const user of stale) await deleteUnverifiedUser(user._id);
  return stale.length;
}

/**
 * Remove memberships pointing at a user or org that no longer exists, then
 * orgs left with no members at all. Orgs younger than an hour are skipped so
 * a signup/org-create that's mid-way (org written, membership not yet) is
 * never swept out from under it.
 */
export async function sweepOrphans(limit = 200): Promise<{ memberships: number; organizations: number }> {
  const users = UserModel.collection.collectionName;
  const orgs = OrganizationModel.collection.collectionName;
  const memberships = MembershipModel.collection.collectionName;

  const orphanMemberships = await MembershipModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    organizationId: mongoose.Types.ObjectId;
  }>([
    { $lookup: { from: users, localField: "userId", foreignField: "_id", as: "u" } },
    { $lookup: { from: orgs, localField: "organizationId", foreignField: "_id", as: "o" } },
    { $match: { $or: [{ u: { $size: 0 } }, { o: { $size: 0 } }] } },
    { $project: { _id: 1, userId: 1, organizationId: 1 } },
    { $limit: limit },
  ]);
  if (orphanMemberships.length) {
    await MembershipModel.deleteMany({ _id: { $in: orphanMemberships.map((m) => m._id) } });
    for (const m of orphanMemberships) {
      await unassignUser(m.userId, { organizationId: m.organizationId });
    }
  }

  const emptyOrgs = await OrganizationModel.aggregate<{ _id: mongoose.Types.ObjectId }>([
    { $match: { createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } } },
    { $lookup: { from: memberships, localField: "_id", foreignField: "organizationId", as: "m" } },
    { $match: { m: { $size: 0 } } },
    { $project: { _id: 1 } },
    { $limit: limit },
  ]);
  await deleteOrganizationsCascade(emptyOrgs.map((o) => o._id));

  return { memberships: orphanMemberships.length, organizations: emptyOrgs.length };
}

/**
 * Flip PENDING invitations past their expiry to EXPIRED. Previously that
 * only happened when someone tried to accept one, so the org's pending list
 * kept showing dead invites.
 */
export async function expireStaleInvitations(): Promise<number> {
  const result = await InvitationModel.updateMany(
    { status: "PENDING", expiresAt: { $lt: new Date() } },
    { status: "EXPIRED" }
  );
  return result.modifiedCount;
}
