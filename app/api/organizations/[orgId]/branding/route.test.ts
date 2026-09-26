import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { PATCH } from "@/app/api/organizations/[orgId]/branding/route";
import OrganizationModel from "@/models/organization.model";
import AuditLogModel from "@/models/auditLog.model";

type Id = mongoose.Types.ObjectId;

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let w: TriageWorld;
beforeEach(async () => {
  w = await seedTriageWorld();
});
const as = (u: Id) => sessionFor(getServerSession, u);
const orgP = (orgId: Id = w.org) => ({ params: Promise.resolve({ orgId: String(orgId) }) });
const patch = (body: unknown, orgId: Id = w.org) =>
  PATCH(jsonReq(`/api/organizations/${orgId}/branding`, "PATCH", body), orgP(orgId));

async function setPlan(plan: "FREE" | "PRO" | "ENTERPRISE", orgId: Id = w.org) {
  await OrganizationModel.updateOne({ _id: orgId }, { plan });
}

describe("PATCH /api/organizations/:orgId/branding", () => {
  it("FREE org: 403 with a PLAN_UPGRADE_REQUIRED code, even for the OWNER", async () => {
    as(w.owner);
    const res = await patch({ accent: "pink" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: "PLAN_UPGRADE_REQUIRED" });
  });

  it("PRO org: OWNER/ADMIN can set accent and welcomeText", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await patch({ accent: "mint", welcomeText: "Welcome!" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      branding: { accent: "mint", welcomeText: "Welcome!", logoVersion: 0 },
    });
    const org = await OrganizationModel.findById(w.org);
    expect(org!.branding).toMatchObject({ accent: "mint", welcomeText: "Welcome!" });
    expect(await AuditLogModel.countDocuments({ action: "branding.updated" })).toBe(1);

    as(w.admin);
    const res2 = await patch({ accent: "blue" });
    expect(res2.status).toBe(200);
  });

  it("MEMBER: 403 even on a PRO org", async () => {
    await setPlan("PRO");
    as(w.memberA);
    expect((await patch({ accent: "pink" })).status).toBe(403);
  });

  it("outsider: 403", async () => {
    await setPlan("PRO");
    as(w.outsider);
    expect((await patch({ accent: "pink" })).status).toBe(403);
  });

  it("rejects welcomeText over 280 characters", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await patch({ welcomeText: "x".repeat(281) });
    expect(res.status).toBe(400);
  });

  it("accepts welcomeText at exactly 280 characters", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await patch({ welcomeText: "x".repeat(280) });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid accent key", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await patch({ accent: "purple" })).status).toBe(400);
  });

  it("rejects moderated welcomeText and never stores it", async () => {
    await setPlan("PRO");
    as(w.owner);
    // Same phrase app/api/r/[replyToken]/route.test.ts uses to trigger
    // lib/contentModeration.ts's obscenity blocklist.
    const res = await patch({ welcomeText: "you are a fucking idiot" });
    expect(res.status).toBe(400);
    const org = await OrganizationModel.findById(w.org);
    expect(org!.branding?.welcomeText).toBeUndefined();
  });

  it("clears welcomeText with an empty string", async () => {
    await setPlan("PRO");
    as(w.owner);
    await patch({ welcomeText: "Hi there" });
    const res = await patch({ welcomeText: "" });
    expect(res.status).toBe(200);
    expect((await res.json()).branding.welcomeText).toBe("");
  });

  it("rejects an empty body and unknown keys", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ accent: "pink", evil: 1 })).status).toBe(400);
  });

  it("a downgrade to FREE blocks further edits without deleting stored branding", async () => {
    await setPlan("PRO");
    as(w.owner);
    await patch({ accent: "mint", welcomeText: "Hi" });
    await setPlan("FREE");
    const res = await patch({ accent: "blue" });
    expect(res.status).toBe(403);
    const org = await OrganizationModel.findById(w.org);
    expect(org!.branding).toMatchObject({ accent: "mint", welcomeText: "Hi" });
  });
});
