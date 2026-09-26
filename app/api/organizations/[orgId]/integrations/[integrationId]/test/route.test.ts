import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { POST } from "@/app/api/organizations/[orgId]/integrations/[integrationId]/test/route";
import OrganizationModel from "@/models/organization.model";
import IntegrationModel from "@/models/integration.model";
import { sealTargetUrl } from "@/lib/integrations";

type Id = mongoose.Types.ObjectId;

beforeAll(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  return startTestDB();
});
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  await stopTestDB();
});

let w: TriageWorld;
let integrationId: Id;
beforeEach(async () => {
  w = await seedTriageWorld();
  await OrganizationModel.updateOne({ _id: w.org }, { plan: "PRO" });
  const doc = await IntegrationModel.create({
    organizationId: w.org,
    kind: "webhook",
    name: "Hook",
    targetHost: "example.com",
    targetUrlEnc: "placeholder",
    createdBy: w.owner,
  });
  integrationId = doc._id as unknown as Id;
  doc.targetUrlEnc = sealTargetUrl(String(w.org), String(integrationId), "https://example.com/hook");
  await doc.save();
});

const as = (u: Id) => sessionFor(getServerSession, u);
const test_ = (intId: Id = integrationId, orgId: Id = w.org) =>
  POST(jsonReq(`/api/organizations/${orgId}/integrations/${intId}/test`, "POST"), {
    params: Promise.resolve({ orgId: String(orgId), integrationId: String(intId) }),
  });

describe("POST /api/organizations/:orgId/integrations/:integrationId/test", () => {
  it("MEMBER: 403", async () => {
    as(w.memberA);
    expect((await test_()).status).toBe(403);
  });

  it("outsider: 403", async () => {
    as(w.outsider);
    expect((await test_()).status).toBe(403);
  });

  it("cross-org: 404", async () => {
    as(w.outsider);
    const res = await POST(
      jsonReq(`/api/organizations/${w.other}/integrations/${integrationId}/test`, "POST"),
      { params: Promise.resolve({ orgId: String(w.other), integrationId: String(integrationId) }) }
    );
    expect(res.status).toBe(404);
  });

  it("OWNER can trigger a test send; real network is refused under Vitest and reported as a coarse failure", async () => {
    as(w.owner);
    const res = await test_();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, ok: false, status: "fail" });
    expect(body).not.toHaveProperty("targetUrlEnc");
    const stored = await IntegrationModel.findById(integrationId);
    expect(stored!.lastAttemptAt).toBeInstanceOf(Date);
    expect(stored!.lastStatus).toBe("fail");
    expect(stored!.consecutiveFailures).toBe(0); // test sends never touch this counter
  });

  it("rate-limited at 5 per minute per integration", async () => {
    as(w.owner);
    for (let i = 0; i < 5; i++) {
      expect((await test_()).status).toBe(200);
    }
    expect((await test_()).status).toBe(429);
  });

  it("a downgrade to FREE blocks test-sending", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    as(w.owner);
    expect((await test_()).status).toBe(403);
  });
});
