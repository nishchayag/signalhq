import mongoose from "mongoose";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import InvitationModel from "@/models/invitation.model";
import { createPersonalOrganization } from "@/lib/orgContext";

// Deliberately does NOT import lib/mailService: `new Resend()` throws at
// import time without RESEND_API_KEY, and this module is shared by routes,
// the cron, and tests.

type Id = string | mongoose.Types.ObjectId;

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
