import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { PATCH, DELETE } from "@/app/api/organizations/[orgId]/integrations/[integrationId]/route";
import OrganizationModel from "@/models/organization.model";
import IntegrationModel from "@/models/integration.model";
import AuditLogModel from "@/models/auditLog.model";
import { openTargetUrl } from "@/lib/integrations";

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
    name: "Original name",
    targetHost: "example.com",
    targetUrlEnc: "placeholder",
    createdBy: w.owner,
  });
  integrationId = doc._id as unknown as Id;
  // Seal a real URL now that we have the real _id (mirrors the route).
  const { sealTargetUrl } = await import("@/lib/integrations");
  doc.targetUrlEnc = sealTargetUrl(String(w.org), String(integrationId), "https://example.com/hooks/signalhq");
  await doc.save();
});

const as = (u: Id) => sessionFor(getServerSession, u);
const p = (orgId: Id = w.org, intId: Id = integrationId) => ({
  params: Promise.resolve({ orgId: String(orgId), integrationId: String(intId) }),
});
const patch = (body: unknown, orgId: Id = w.org, intId: Id = integrationId) =>
  PATCH(jsonReq(`/api/organizations/${orgId}/integrations/${intId}`, "PATCH", body), p(orgId, intId));
const del = (orgId: Id = w.org, intId: Id = integrationId) =>
  DELETE(jsonReq(`/api/organizations/${orgId}/integrations/${intId}`, "DELETE"), p(orgId, intId));

describe("PATCH /api/organizations/:orgId/integrations/:integrationId", () => {
  it("MEMBER: 403", async () => {
    as(w.memberA);
    expect((await patch({ name: "New" })).status).toBe(403);
  });

  it("outsider: 403", async () => {
    as(w.outsider);
    expect((await patch({ name: "New" })).status).toBe(403);
  });

  it("cross-org: 404 (an integration from another org, addressed via a different orgId, doesn't leak)", async () => {
    as(w.outsider);
    // outsider owns w.other; asking for w.org's integration under their own
    // org still needs org:integrations there, and either way the doc is
    // scoped to organizationId in the query.
    const res = await PATCH(
      jsonReq(`/api/organizations/${w.other}/integrations/${integrationId}`, "PATCH", { name: "x" }),
      p(w.other, integrationId)
    );
    expect(res.status).toBe(404);
  });

  it("OWNER/ADMIN can rename, toggle payloadMode/events/enabled", async () => {
    as(w.owner);
    const res = await patch({ name: "Renamed", payloadMode: "nudge", events: ["message.created"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integration).toMatchObject({ name: "Renamed", payloadMode: "nudge", events: ["message.created"] });
    expect(await AuditLogModel.countDocuments({ action: "integration.updated" })).toBe(1);
    const entry = await AuditLogModel.findOne({ action: "integration.updated" });
    expect(entry!.metadata).toMatchObject({ name: "Renamed" });
    expect((entry!.metadata!.changedFields as string[]).sort()).toEqual(["events", "name", "payloadMode"]);
  });

  it("re-validates and re-seals a new url", async () => {
    as(w.owner);
    const res = await patch({ url: "https://example.org/new-hook" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integration.targetHost).toBe("example.org");
    const stored = await IntegrationModel.findById(integrationId).select("+targetUrlEnc");
    expect(openTargetUrl(String(w.org), String(integrationId), stored!.targetUrlEnc)).toBe(
      "https://example.org/new-hook"
    );
  });

  it("rejects a disallowed new url with 400 URL_NOT_ALLOWED, leaving the old target intact", async () => {
    as(w.owner);
    const res = await patch({ url: "http://127.0.0.1/hook" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "URL_NOT_ALLOWED" });
    const stored = await IntegrationModel.findById(integrationId).select("+targetUrlEnc");
    expect(openTargetUrl(String(w.org), String(integrationId), stored!.targetUrlEnc)).toBe(
      "https://example.com/hooks/signalhq"
    );
  });

  it("re-enabling resets consecutiveFailures and clears disabledAt/disabledReason", async () => {
    await IntegrationModel.updateOne(
      { _id: integrationId },
      { enabled: false, consecutiveFailures: 10, disabledAt: new Date(), disabledReason: "auto_disabled_consecutive_failures" }
    );
    as(w.owner);
    const res = await patch({ enabled: true });
    expect(res.status).toBe(200);
    const stored = await IntegrationModel.findById(integrationId);
    expect(stored!.enabled).toBe(true);
    expect(stored!.consecutiveFailures).toBe(0);
    expect(stored!.disabledAt).toBeUndefined();
    expect(stored!.disabledReason).toBeUndefined();
  });

  it("a downgrade to FREE blocks edits without deleting the integration", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    as(w.owner);
    const res = await patch({ name: "New" });
    expect(res.status).toBe(403);
    expect(await IntegrationModel.countDocuments({ _id: integrationId })).toBe(1);
  });

  it("rejects an empty body and unknown keys", async () => {
    as(w.owner);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: "x", evil: 1 })).status).toBe(400);
  });
});

describe("DELETE /api/organizations/:orgId/integrations/:integrationId", () => {
  it("MEMBER: 403", async () => {
    as(w.memberA);
    expect((await del()).status).toBe(403);
  });

  it("cross-org: 404", async () => {
    as(w.outsider);
    const res = await DELETE(
      jsonReq(`/api/organizations/${w.other}/integrations/${integrationId}`, "DELETE"),
      p(w.other, integrationId)
    );
    expect(res.status).toBe(404);
  });

  it("OWNER/ADMIN can delete, and it's audited with host only", async () => {
    as(w.owner);
    const res = await del();
    expect(res.status).toBe(200);
    expect(await IntegrationModel.exists({ _id: integrationId })).toBeNull();
    const entry = await AuditLogModel.findOne({ action: "integration.deleted" });
    expect(entry!.metadata).toMatchObject({ host: "example.com" });
    expect(JSON.stringify(entry!.metadata)).not.toContain("/hooks/signalhq");
  });

  it("delete works even on a downgraded FREE org", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    as(w.owner);
    expect((await del()).status).toBe(200);
  });

  it("a bogus integrationId 404s instead of 500ing", async () => {
    as(w.owner);
    const res = await DELETE(
      jsonReq(`/api/organizations/${w.org}/integrations/not-an-id`, "DELETE"),
      p(w.org, "not-an-id" as unknown as Id)
    );
    expect(res.status).toBe(404);
  });
});
