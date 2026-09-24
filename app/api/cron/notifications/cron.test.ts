import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { sendNotificationEmail } = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/mailService", () => ({
  sendNotificationEmail,
  sendEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
import { aiMock } from "@/test-utils/aiMock";
// Pass-through spy so one test can make the AI step blow up.
const { enrichPendingSpy } = vi.hoisted(() => ({ enrichPendingSpy: vi.fn() }));
vi.mock("@/lib/aiEnrichment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiEnrichment")>("@/lib/aiEnrichment");
  enrichPendingSpy.mockImplementation(actual.enrichPending);
  return { ...actual, enrichPending: enrichPendingSpy };
});

// Pass-through spy to check the digest step's deadline.
const { flushSpy } = vi.hoisted(() => ({ flushSpy: vi.fn() }));
vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  flushSpy.mockImplementation(actual.flushDailyDigests);
  return { ...actual, flushDailyDigests: flushSpy };
});

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as cron } from "@/app/api/cron/notifications/route";
import { flushDailyDigests } from "@/lib/notifications";
import { expireStaleInvitations, sweepExpiredUnverifiedUsers, sweepOrphans } from "@/lib/orgCleanup";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import InvitationModel from "@/models/invitation.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  sendNotificationEmail.mockReset();
  sendNotificationEmail.mockResolvedValue(true);
  delete process.env.CRON_SECRET;
});
afterAll(stopTestDB);

let n = 0;
function makeUser(overrides: Record<string, unknown> = {}) {
  n++;
  return UserModel.create({
    name: "Person",
    username: `cronuser${n}`,
    email: `cronuser${n}@example.com`,
    password: "x",
    isVerified: true,
    ...overrides,
  });
}
const call = (auth?: string) =>
  cron(new NextRequest("http://localhost/api/cron/notifications", {
    headers: auth ? { authorization: auth } : {},
  }));

describe("cron auth", () => {
  it("refuses every call when CRON_SECRET is unset — including 'Bearer undefined'", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("refuses a wrong secret and accepts the right one", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await call("Bearer nope")).status).toBe(401);
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });
});

describe("flushDailyDigests", () => {
  it("sends once per user even when two runs overlap, and zeroes the count", async () => {
    const user = await makeUser({ notificationPreference: "daily", pendingNotificationCount: 3 });

    const [a, b] = await Promise.all([flushDailyDigests(), flushDailyDigests()]);

    expect(a.sent + b.sent).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect((await UserModel.findById(user._id))?.pendingNotificationCount).toBe(0);
  });

  it("gives the count back when the email fails, so tomorrow's digest includes it", async () => {
    sendNotificationEmail.mockResolvedValue(false);
    const user = await makeUser({ notificationPreference: "daily", pendingNotificationCount: 2 });

    const result = await flushDailyDigests();

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect((await UserModel.findById(user._id))?.pendingNotificationCount).toBe(2);
  });

  it("ignores users on 'immediate' or 'off'", async () => {
    await makeUser({ notificationPreference: "immediate", pendingNotificationCount: 5 });
    await makeUser({ notificationPreference: "off", pendingNotificationCount: 5 });
    expect((await flushDailyDigests()).total).toBe(0);
  });
});

describe("cleanup sweeps", () => {
  it("deletes long-expired unverified signups (with their org) but not recent or verified ones", async () => {
    const stale = await makeUser({ isVerified: false, verifyCodeExpiry: new Date(Date.now() - 2 * 86400000) });
    await OrganizationModel.create({ name: "Stale", slug: "stale", createdBy: stale._id });
    const fresh = await makeUser({ isVerified: false, verifyCodeExpiry: new Date(Date.now() + 60000) });
    const verified = await makeUser({ isVerified: true });

    expect(await sweepExpiredUnverifiedUsers()).toBe(1);
    expect(await UserModel.exists({ _id: stale._id })).toBeNull();
    expect(await OrganizationModel.exists({ slug: "stale" })).toBeNull();
    expect(await UserModel.exists({ _id: fresh._id })).not.toBeNull();
    expect(await UserModel.exists({ _id: verified._id })).not.toBeNull();
  });

  it("removes orphaned memberships and old empty orgs, but spares a brand-new org", async () => {
    const owner = await makeUser();
    const live = await OrganizationModel.create({ name: "Live", slug: "live", createdBy: owner._id });
    await MembershipModel.create({ organizationId: live._id, userId: owner._id, role: "OWNER" });
    // membership for a user that no longer exists
    await MembershipModel.create({ organizationId: live._id, userId: new mongoose.Types.ObjectId(), role: "MEMBER" });
    // an empty org from two hours ago, and one created just now
    const old = await OrganizationModel.create({ name: "Old", slug: "old-empty", createdBy: owner._id });
    // Raw collection write: Mongoose treats timestamp `createdAt` as
    // immutable and silently drops it from model.updateOne (measured).
    await OrganizationModel.collection.updateOne(
      { _id: old._id as never },
      { $set: { createdAt: new Date(Date.now() - 2 * 3600000) } }
    );
    await OrganizationModel.create({ name: "New", slug: "new-empty", createdBy: owner._id });

    const result = await sweepOrphans();

    expect(result).toEqual({ memberships: 1, organizations: 1 });
    expect(await MembershipModel.countDocuments({ organizationId: live._id })).toBe(1);
    expect(await OrganizationModel.exists({ slug: "old-empty" })).toBeNull();
    expect(await OrganizationModel.exists({ slug: "new-empty" })).not.toBeNull();
  });

  it("marks expired pending invitations EXPIRED, leaving live and accepted ones alone", async () => {
    const owner = await makeUser();
    const orgId = new mongoose.Types.ObjectId();
    const base = { organizationId: orgId, invitedBy: owner._id, role: "MEMBER" };
    await InvitationModel.create([
      { ...base, email: "a@x.com", token: "t1", expiresAt: new Date(Date.now() - 1000) },
      { ...base, email: "b@x.com", token: "t2", expiresAt: new Date(Date.now() + 1e6) },
      { ...base, email: "c@x.com", token: "t3", status: "ACCEPTED", expiresAt: new Date(Date.now() - 1000) },
    ]);

    expect(await expireStaleInvitations()).toBe(1);
    expect((await InvitationModel.findOne({ token: "t1" }))?.status).toBe("EXPIRED");
    expect((await InvitationModel.findOne({ token: "t2" }))?.status).toBe("PENDING");
    expect((await InvitationModel.findOne({ token: "t3" }))?.status).toBe("ACCEPTED");
  });
});

describe("cron digest step", () => {
  it("gets a deadline that leaves time for the sweeps and AI enrichment", async () => {
    process.env.CRON_SECRET = "s3cret";
    const before = Date.now();
    expect((await call("Bearer s3cret")).status).toBe(200);
    const { deadline } = flushSpy.mock.calls.at(-1)![0] as { deadline: number };
    // The route stamps `start` between `before` and now.
    expect(deadline).toBeGreaterThanOrEqual(before + 35_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 35_000);
  });
});

describe("cron AI enrichment step", () => {
  it("runs last, enriches pending messages and reports counts", async () => {
    process.env.CRON_SECRET = "s3cret";
    aiMock.reset();
    aiMock.setObject({ sentiment: "neutral", tags: ["process"] });
    const org = await OrganizationModel.create({
      name: "Acme", slug: "acme-cron", createdBy: new mongoose.Types.ObjectId(),
    });
    const msg = await MessageModel.create({
      content: "Standups run long",
      createdFor: org.createdBy,
      organizationId: org._id,
      ai: { status: "pending", attempts: 0 },
    });

    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiEnrichment).toMatchObject({ candidates: 1, done: 1 });
    expect(enrichPendingSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    const deadline = enrichPendingSpy.mock.calls.at(-1)![0].deadline as number;
    expect(deadline - Date.now()).toBeLessThanOrEqual(50_000);
    expect((await MessageModel.collection.findOne({ _id: msg._id }))?.ai.status).toBe("done");
  });

  it("a failing AI step doesn't fail the cron or skip the other steps", async () => {
    process.env.CRON_SECRET = "s3cret";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    enrichPendingSpy.mockRejectedValueOnce(new Error("boom"));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, aiEnrichment: { error: true } });
    expect(body.digests).not.toHaveProperty("error");
    spy.mockRestore();
  });
});
