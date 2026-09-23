import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  deleteOrganizationsCascade,
  deleteUnverifiedUser,
  rehomeStrandedUsers,
} from "@/lib/orgCleanup";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import InvitationModel from "@/models/invitation.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

let n = 0;
async function makeUser(overrides: Record<string, unknown> = {}) {
  n++;
  return UserModel.create({
    name: "Test User",
    username: `user${n}`,
    email: `user${n}@example.com`,
    password: "hashed",
    ...overrides,
  });
}

async function makeOrg(ownerId: mongoose.Types.ObjectId, slug: string) {
  const org = await OrganizationModel.create({ name: slug, slug, createdBy: ownerId });
  await MembershipModel.create({ organizationId: org._id, userId: ownerId, role: "OWNER" });
  return org;
}

describe("deleteOrganizationsCascade", () => {
  it("removes the org and everything it owns, and nothing else", async () => {
    const owner = await makeUser();
    const doomed = await makeOrg(owner._id, "doomed");
    const kept = await makeOrg(owner._id, "kept");
    for (const org of [doomed, kept]) {
      const q = await QuestionModel.create({
        questionText: "Q?",
        userId: owner._id,
        organizationId: org._id,
        slug: `q-${org.slug}`,
      });
      await MessageModel.create({ content: "hi", createdFor: owner._id, organizationId: org._id, questionId: q._id });
      await TeamModel.create({ organizationId: org._id, name: "T", slug: "t", createdBy: owner._id });
      await InvitationModel.create({
        organizationId: org._id,
        email: `x@${org.slug}.com`,
        token: `tok-${org.slug}`,
        invitedBy: owner._id,
        expiresAt: new Date(Date.now() + 1e6),
      });
    }

    await deleteOrganizationsCascade([doomed._id]);

    expect(await OrganizationModel.exists({ _id: doomed._id })).toBeNull();
    for (const Model of [MessageModel, QuestionModel, TeamModel, InvitationModel, MembershipModel]) {
      expect(await (Model as typeof MessageModel).countDocuments({ organizationId: doomed._id })).toBe(0);
      expect(await (Model as typeof MessageModel).countDocuments({ organizationId: kept._id })).toBe(1);
    }
  });

  it("is a no-op for an empty list", async () => {
    await expect(deleteOrganizationsCascade([])).resolves.toBeUndefined();
  });
});

describe("deleteUnverifiedUser", () => {
  it("deletes the user, their personal org, and their memberships", async () => {
    const user = await makeUser();
    const personal = await makeOrg(user._id, "personal");

    await deleteUnverifiedUser(user._id);

    expect(await UserModel.exists({ _id: user._id })).toBeNull();
    expect(await OrganizationModel.exists({ _id: personal._id })).toBeNull();
    expect(await MembershipModel.countDocuments({ userId: user._id })).toBe(0);
  });

  it("keeps an org they created if other people are members of it", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const shared = await makeOrg(user._id, "shared");
    await MembershipModel.create({ organizationId: shared._id, userId: other._id, role: "ADMIN" });

    await deleteUnverifiedUser(user._id);

    expect(await OrganizationModel.exists({ _id: shared._id })).not.toBeNull();
    expect(await MembershipModel.countDocuments({ organizationId: shared._id })).toBe(1);
  });
});

describe("rehomeStrandedUsers", () => {
  it("gives a user with zero memberships a new personal org", async () => {
    const user = await makeUser();

    const rehomed = await rehomeStrandedUsers([user._id]);

    expect(rehomed).toEqual([String(user._id)]);
    const membership = await MembershipModel.findOne({ userId: user._id });
    expect(membership?.role).toBe("OWNER");
  });

  it("leaves users who still belong to an org alone, and skips missing users", async () => {
    const user = await makeUser();
    await makeOrg(user._id, "still-here");

    const rehomed = await rehomeStrandedUsers([user._id, new mongoose.Types.ObjectId()]);

    expect(rehomed).toEqual([]);
    expect(await MembershipModel.countDocuments({ userId: user._id })).toBe(1);
  });
});
