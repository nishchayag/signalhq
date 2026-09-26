import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { GET, POST } from "@/app/api/organizations/[orgId]/integrations/route";
import OrganizationModel from "@/models/organization.model";
import IntegrationModel from "@/models/integration.model";
import AuditLogModel from "@/models/auditLog.model";

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
beforeEach(async () => {
  w = await seedTriageWorld();
});
const as = (u: Id) => sessionFor(getServerSession, u);
const orgP = (orgId: Id = w.org) => ({ params: Promise.resolve({ orgId: String(orgId) }) });

async function setPlan(plan: "FREE" | "PRO" | "ENTERPRISE", orgId: Id = w.org) {
  await OrganizationModel.updateOne({ _id: orgId }, { plan });
}

const list = (orgId: Id = w.org) => GET(jsonReq(`/api/organizations/${orgId}/integrations`, "GET"), orgP(orgId));
const create = (body: unknown, orgId: Id = w.org) =>
  POST(jsonReq(`/api/organizations/${orgId}/integrations`, "POST", body), orgP(orgId));

const SLACK_URL = "https://hooks.slack.com/services/T000/B000/xxxxxxxxxxxxxxxxxxxxxxxx";
const WEBHOOK_URL = "https://example.com/hooks/signalhq";

describe("GET /api/organizations/:orgId/integrations", () => {
  it("any member can list (even on FREE, with allowed:false)", async () => {
    as(w.memberA);
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, integrations: [], allowed: false, canManage: false });
  });

  it("canManage reflects OWNER/ADMIN vs MEMBER", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await (await list()).json()).canManage).toBe(true);
    as(w.admin);
    expect((await (await list()).json()).canManage).toBe(true);
    as(w.memberA);
    expect((await (await list()).json()).canManage).toBe(false);
  });

  it("an outsider gets 403", async () => {
    as(w.outsider);
    expect((await list()).status).toBe(403);
  });

  it("never returns targetUrlEnc/secretEnc", async () => {
    await setPlan("PRO");
    await IntegrationModel.create({
      organizationId: w.org,
      kind: "webhook",
      name: "Hook",
      targetHost: "example.com",
      targetUrlEnc: "sealed-url",
      secretEnc: "sealed-secret",
      secretHint: "ab12",
      createdBy: w.owner,
    });
    as(w.memberA);
    const body = await (await list()).json();
    expect(body.integrations).toHaveLength(1);
    const json = JSON.stringify(body);
    expect(json).not.toContain("sealed-url");
    expect(json).not.toContain("sealed-secret");
    expect(body.integrations[0].secretHint).toBe("ab12");
    expect(body.integrations[0]).not.toHaveProperty("targetUrlEnc");
    expect(body.integrations[0]).not.toHaveProperty("secretEnc");
  });

  it("cross-org: 404 for a garbage/foreign orgId is unreachable via this route (membership gate is 403), but a bogus id 404s", async () => {
    as(w.owner);
    const res = await GET(
      jsonReq("/api/organizations/000000000000000000000000/integrations", "GET"),
      { params: Promise.resolve({ orgId: "000000000000000000000000" }) }
    );
    expect(res.status).toBe(403); // not a member of that (nonexistent) org
  });
});

describe("POST /api/organizations/:orgId/integrations", () => {
  it("FREE org: 403 PLAN_UPGRADE_REQUIRED, even for OWNER", async () => {
    as(w.owner);
    const res = await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, code: "PLAN_UPGRADE_REQUIRED" });
  });

  it("MEMBER: 403 even on PRO", async () => {
    await setPlan("PRO");
    as(w.memberA);
    expect((await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL })).status).toBe(403);
  });

  it("outsider: 403", async () => {
    await setPlan("PRO");
    as(w.outsider);
    expect((await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL })).status).toBe(403);
  });

  it("503 INTEGRATIONS_UNAVAILABLE when no encryption key is configured", async () => {
    await setPlan("PRO");
    const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY;
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    try {
      as(w.owner);
      const res = await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: "INTEGRATIONS_UNAVAILABLE" });
    } finally {
      process.env.INTEGRATIONS_ENCRYPTION_KEY = saved;
    }
  });

  it("OWNER/ADMIN on PRO+ can create a webhook integration; the signing secret is returned once", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await create({ kind: "webhook", name: "My hook", url: WEBHOOK_URL });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.integration).toMatchObject({
      kind: "webhook",
      name: "My hook",
      targetHost: "example.com",
      enabled: true,
      payloadMode: "full",
    });
    expect(typeof body.signingSecret).toBe("string");
    expect(body.signingSecret.startsWith("whsec_")).toBe(true);
    expect(body.integration.secretHint).toBe(body.signingSecret.slice(-4));
    expect(body.integration).not.toHaveProperty("targetUrlEnc");
    expect(body.integration).not.toHaveProperty("secretEnc");

    const stored = await IntegrationModel.findOne({ organizationId: w.org }).select("+targetUrlEnc +secretEnc");
    expect(stored!.targetUrlEnc).not.toContain(WEBHOOK_URL);
    expect(await AuditLogModel.countDocuments({ action: "integration.created" })).toBe(1);
    const entry = await AuditLogModel.findOne({ action: "integration.created" });
    expect(entry!.metadata).toMatchObject({ kind: "webhook", host: "example.com", name: "My hook" });
    // Host-only audit: the full URL never lands in the audit metadata.
    expect(JSON.stringify(entry!.metadata)).not.toContain("/hooks/signalhq");
  });

  it("a slack integration gets no signing secret", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await create({ kind: "slack", name: "Slack", url: SLACK_URL });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.signingSecret).toBeUndefined();
    expect(body.integration.secretHint).toBeNull();
  });

  it("rejects a disallowed URL with 400 URL_NOT_ALLOWED", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await create({ kind: "webhook", name: "Hook", url: "http://127.0.0.1/hook" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "URL_NOT_ALLOWED" });
    expect(await IntegrationModel.countDocuments({})).toBe(0);
  });

  it("rejects a slack kind pointed at a non-hooks.slack.com host", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await create({ kind: "slack", name: "Slack", url: "https://hooks.slack.com.evil.com/services/x" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (unknown key, missing fields)", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await create({})).status).toBe(400);
    expect(
      (await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL, evil: 1 })).status
    ).toBe(400);
    expect((await create({ kind: "carrier-pigeon", name: "Hook", url: WEBHOOK_URL })).status).toBe(400);
  });

  it("enforces the 5-per-org limit with 409 LIMIT", async () => {
    await setPlan("PRO");
    as(w.owner);
    for (let i = 0; i < 5; i++) {
      const res = await create({ kind: "webhook", name: `Hook ${i}`, url: WEBHOOK_URL });
      expect(res.status).toBe(201);
    }
    const res = await create({ kind: "webhook", name: "One too many", url: WEBHOOK_URL });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "LIMIT" });
    expect(await IntegrationModel.countDocuments({ organizationId: w.org })).toBe(5);
  });

  it("a downgrade to FREE blocks further creation without deleting stored integrations", async () => {
    await setPlan("PRO");
    as(w.owner);
    await create({ kind: "webhook", name: "Hook", url: WEBHOOK_URL });
    await setPlan("FREE");
    const res = await create({ kind: "webhook", name: "Hook 2", url: WEBHOOK_URL });
    expect(res.status).toBe(403);
    expect(await IntegrationModel.countDocuments({ organizationId: w.org })).toBe(1);
  });
});
