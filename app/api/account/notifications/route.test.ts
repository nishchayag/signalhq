import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { aiMock } from "@/test-utils/aiMock";
import { GET, PATCH } from "@/app/api/account/notifications/route";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import mongoose from "mongoose";

beforeAll(startTestDB);
beforeEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  aiMock.reset();
});
afterAll(stopTestDB);

async function signedInUser(overrides: Record<string, unknown> = {}) {
  const user = await UserModel.create({
    name: "N",
    username: "notifuser",
    email: "notifuser@example.com",
    password: "x",
    isVerified: true,
    ...overrides,
  });
  getServerSession.mockResolvedValue({ user: { _id: String(user._id) } });
  return user;
}

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/account/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
  }));

describe("/api/account/notifications", () => {
  it("401s without a session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await patch({ aiDigestSummary: false })).status).toBe(401);
  });

  it("GET returns the preference, aiDigestSummary (default true) and aiAvailable", async () => {
    await signedInUser();
    expect(await (await GET()).json()).toEqual({
      success: true,
      notificationPreference: "daily",
      aiDigestSummary: true,
      aiAvailable: true,
      orgs: [],
    });
    aiMock.disable();
    expect((await (await GET()).json()).aiAvailable).toBe(false);
  });

  it("PATCH updates aiDigestSummary alone without touching the preference", async () => {
    const user = await signedInUser({ notificationPreference: "immediate" });
    expect((await patch({ aiDigestSummary: false })).status).toBe(200);
    const fresh = await UserModel.findById(user._id);
    expect(fresh.aiDigestSummary).toBe(false);
    expect(fresh.notificationPreference).toBe("immediate");
    expect((await (await GET()).json()).aiDigestSummary).toBe(false);
  });

  it("PATCH updates the preference alone without touching aiDigestSummary", async () => {
    const user = await signedInUser({ aiDigestSummary: false });
    expect((await patch({ notificationPreference: "off" })).status).toBe(200);
    const fresh = await UserModel.findById(user._id);
    expect(fresh.notificationPreference).toBe("off");
    expect(fresh.aiDigestSummary).toBe(false);
  });

  it("PATCH 400s an empty or invalid body", async () => {
    await signedInUser();
    expect((await patch({})).status).toBe(400);
    expect((await patch({ aiDigestSummary: "no" })).status).toBe(400);
  });

  async function orgFor(userId: unknown, role: "OWNER" | "ADMIN" | "MEMBER", name: string) {
    const org = await OrganizationModel.create({
      name,
      slug: name.toLowerCase(),
      createdBy: new mongoose.Types.ObjectId(),
    });
    await MembershipModel.create({ organizationId: org._id, userId, role });
    return org;
  }

  it("GET lists the caller's orgs with role and mute state", async () => {
    const user = await signedInUser();
    const a = await orgFor(user._id, "OWNER", "Alpha");
    const b = await orgFor(user._id, "MEMBER", "Beta");
    await MembershipModel.updateOne({ organizationId: b._id, userId: user._id }, { notificationsMuted: true });
    await orgFor(new mongoose.Types.ObjectId(), "OWNER", "Foreign");

    const { orgs } = await (await GET()).json();
    expect(orgs).toEqual([
      { organizationId: String(a._id), name: "Alpha", role: "OWNER", muted: false },
      { organizationId: String(b._id), name: "Beta", role: "MEMBER", muted: true },
    ]);
  });

  it("PATCH mutedOrgs mutes and unmutes the caller's memberships only", async () => {
    const user = await signedInUser();
    const a = await orgFor(user._id, "ADMIN", "Alpha");
    const b = await orgFor(user._id, "OWNER", "Beta");
    await MembershipModel.updateOne({ organizationId: b._id, userId: user._id }, { notificationsMuted: true });

    const res = await patch({ mutedOrgs: { [String(a._id)]: true, [String(b._id)]: false } });
    expect(res.status).toBe(200);
    const byOrg = async (orgId: unknown) =>
      (await MembershipModel.findOne({ organizationId: orgId, userId: user._id }))!.notificationsMuted;
    expect(await byOrg(a._id)).toBe(true);
    expect(await byOrg(b._id)).toBe(false);
    // Preference untouched.
    expect((await UserModel.findById(user._id)).notificationPreference).toBe("daily");
  });

  it("PATCH mutedOrgs 400s a foreign org id and changes nothing", async () => {
    const user = await signedInUser();
    const mine = await orgFor(user._id, "OWNER", "Mine");
    const otherUser = new mongoose.Types.ObjectId();
    const foreign = await orgFor(otherUser, "OWNER", "Foreign");

    const res = await patch({
      notificationPreference: "off",
      mutedOrgs: { [String(mine._id)]: true, [String(foreign._id)]: true },
    });
    expect(res.status).toBe(400);
    expect((await MembershipModel.findOne({ organizationId: mine._id }))!.notificationsMuted).toBe(false);
    expect((await MembershipModel.findOne({ organizationId: foreign._id }))!.notificationsMuted).toBe(false);
    expect((await UserModel.findById(user._id)).notificationPreference).toBe("daily");
  });

  it("PATCH mutedOrgs 400s malformed ids, non-boolean values and an empty map", async () => {
    await signedInUser();
    expect((await patch({ mutedOrgs: { "not-an-id": true } })).status).toBe(400);
    expect((await patch({ mutedOrgs: { [String(new mongoose.Types.ObjectId())]: "yes" } })).status).toBe(400);
    expect((await patch({ mutedOrgs: {} })).status).toBe(400);
    expect((await patch({ mutedOrgs: { [String(new mongoose.Types.ObjectId())]: true }, extra: 1 })).status).toBe(400);
  });
});
