import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { POST } from "@/app/api/organizations/[orgId]/integrations/[integrationId]/rotate-secret/route";
import OrganizationModel from "@/models/organization.model";
import IntegrationModel from "@/models/integration.model";
import AuditLogModel from "@/models/auditLog.model";
import { sealSecret, sealTargetUrl } from "@/lib/integrations";

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
let webhookId: Id;
let slackId: Id;
beforeEach(async () => {
  w = await seedTriageWorld();
  await OrganizationModel.updateOne({ _id: w.org }, { plan: "PRO" });
  const webhook = await IntegrationModel.create({
    organizationId: w.org,
    kind: "webhook",
    name: "Hook",
    targetHost: "example.com",
    targetUrlEnc: "placeholder",
    secretEnc: "placeholder",
    secretHint: "aaaa",
    createdBy: w.owner,
  });
  webhookId = webhook._id as unknown as Id;
  webhook.targetUrlEnc = sealTargetUrl(String(w.org), String(webhookId), "https://example.com/hook");
  webhook.secretEnc = sealSecret(String(w.org), String(webhookId), "whsec_old-secret-value");
  await webhook.save();

  const slack = await IntegrationModel.create({
    organizationId: w.org,
    kind: "slack",
    name: "Slack",
    targetHost: "hooks.slack.com",
    targetUrlEnc: "placeholder",
    createdBy: w.owner,
  });
  slackId = slack._id as unknown as Id;
  slack.targetUrlEnc = sealTargetUrl(
    String(w.org),
    String(slackId),
    "https://hooks.slack.com/services/T0/B0/xxxx"
  );
  await slack.save();
});

const as = (u: Id) => sessionFor(getServerSession, u);
const rotate = (intId: Id, orgId: Id = w.org) =>
  POST(jsonReq(`/api/organizations/${orgId}/integrations/${intId}/rotate-secret`, "POST"), {
    params: Promise.resolve({ orgId: String(orgId), integrationId: String(intId) }),
  });

describe("POST /api/organizations/:orgId/integrations/:integrationId/rotate-secret", () => {
  it("MEMBER: 403", async () => {
    as(w.memberA);
    expect((await rotate(webhookId)).status).toBe(403);
  });

  it("OWNER can rotate a webhook's secret; the new secret is returned once", async () => {
    as(w.owner);
    const before = await IntegrationModel.findById(webhookId).select("+secretEnc");
    const res = await rotate(webhookId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.signingSecret).toBe("string");
    expect(body.signingSecret.startsWith("whsec_")).toBe(true);
    expect(body.integration.secretHint).toBe(body.signingSecret.slice(-4));
    expect(body.integration).not.toHaveProperty("secretEnc");
    const after = await IntegrationModel.findById(webhookId).select("+secretEnc");
    expect(after!.secretEnc).not.toBe(before!.secretEnc);
    expect(await AuditLogModel.countDocuments({ action: "integration.secret_rotated" })).toBe(1);
  });

  it("400 for a Slack integration (no signing secret to rotate)", async () => {
    as(w.owner);
    const res = await rotate(slackId);
    expect(res.status).toBe(400);
  });

  it("cross-org: 404", async () => {
    as(w.outsider);
    const res = await POST(
      jsonReq(`/api/organizations/${w.other}/integrations/${webhookId}/rotate-secret`, "POST"),
      { params: Promise.resolve({ orgId: String(w.other), integrationId: String(webhookId) }) }
    );
    expect(res.status).toBe(404);
  });

  it("a downgrade to FREE blocks rotation", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    as(w.owner);
    expect((await rotate(webhookId)).status).toBe(403);
  });
});
