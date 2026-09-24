import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  jsonReq,
  msg,
  rawDoc,
  seedTriageWorld,
  sessionFor,
  type TriageWorld,
} from "@/test-utils/triageFixture";
import { GET, POST } from "@/app/api/organizations/[orgId]/labels/route";
import { PATCH, DELETE } from "@/app/api/organizations/[orgId]/labels/[labelId]/route";
import OrganizationModel from "@/models/organization.model";
import AuditLogModel from "@/models/auditLog.model";
import MessageModel from "@/models/message.model";

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
const labelP = (labelId: Id | string, orgId: Id = w.org) => ({
  params: Promise.resolve({ orgId: String(orgId), labelId: String(labelId) }),
});
const list = () => GET(jsonReq(`/api/organizations/${w.org}/labels`, "GET"), orgP());
const create = (body: unknown, orgId: Id = w.org) =>
  POST(jsonReq(`/api/organizations/${orgId}/labels`, "POST", body), orgP(orgId));
const update = (id: Id | string, body: unknown) =>
  PATCH(jsonReq(`/api/organizations/${w.org}/labels/${id}`, "PATCH", body), labelP(id));
const remove = (id: Id | string, orgId: Id = w.org) =>
  DELETE(jsonReq(`/api/organizations/${orgId}/labels/${id}`, "DELETE"), labelP(id, orgId));

describe("labels CRUD", () => {
  it("GET: any member; lists _id/name/color", async () => {
    as(w.memberA);
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toHaveLength(6);
    expect(body.labels[0]).toEqual({ _id: String(w.labels[0]), name: "bug", color: "yellow" });
    as(w.outsider);
    expect((await list()).status).toBe(403);
  });

  it("writes need org:labels (MEMBER 403)", async () => {
    as(w.memberA);
    expect((await create({ name: "new", color: "mint" })).status).toBe(403);
    expect((await update(w.labels[0], { color: "mint" })).status).toBe(403);
    expect((await remove(w.labels[0])).status).toBe(403);
  });

  it("POST creates (201) and audits; validates input", async () => {
    as(w.admin);
    const res = await create({ name: "  Needs follow-up ", color: "mint" });
    expect(res.status).toBe(201);
    const { label } = await res.json();
    expect(label).toMatchObject({ name: "Needs follow-up", color: "mint" });
    expect(await AuditLogModel.countDocuments({ action: "label.created" })).toBe(1);
    for (const body of [{ name: "", color: "mint" }, { name: "x".repeat(25), color: "mint" }, { name: "x", color: "red" }, { name: "x" }]) {
      expect((await create(body)).status).toBe(400);
    }
  });

  it("POST: duplicate name (case-insensitive) → 409", async () => {
    as(w.owner);
    expect((await create({ name: "BUG", color: "pink" })).status).toBe(409);
    expect((await create({ name: "b.g", color: "pink" })).status).toBe(201); // regex-escaped
  });

  it("POST beyond 30 → 409; nothing past the cap is ever written", async () => {
    as(w.owner);
    for (let i = 0; i < 24; i++) {
      expect((await create({ name: `l${i}`, color: "blue" })).status).toBe(201);
    }
    expect((await create({ name: "one-too-many", color: "blue" })).status).toBe(409);
    // Parallel creates can't race past the cap either.
    await OrganizationModel.updateOne({ _id: w.org }, { $pop: { labels: 1 } });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => create({ name: `race${i}`, color: "blue" }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const org = await OrganizationModel.findById(w.org);
    expect(org!.labels).toHaveLength(30);
  });

  it("PATCH renames/recolours; name clash with another label → 409; own recasing ok", async () => {
    as(w.owner);
    let res = await update(w.labels[0], { name: "Defect", color: "pink" });
    expect(res.status).toBe(200);
    expect((await res.json()).label).toEqual({ _id: String(w.labels[0]), name: "Defect", color: "pink" });
    expect((await update(w.labels[0], { name: "IDEA" })).status).toBe(409);
    res = await update(w.labels[0], { name: "DEFECT" });
    expect(res.status).toBe(200);
    expect((await update(new mongoose.Types.ObjectId(), { name: "z" })).status).toBe(404);
    expect((await update("nope", { name: "z" })).status).toBe(404);
    expect((await update(w.labels[0], {})).status).toBe(400);
    const audit = await AuditLogModel.findOne({ action: "label.updated" });
    expect(audit!.metadata).toMatchObject({ from: "bug", name: "Defect" });
  });

  it("DELETE pulls the label from the org and from every message in the org", async () => {
    const [bug, idea] = w.labels;
    const both = await msg(w, "both", { labels: [bug, idea] });
    const only = await msg(w, "only", { labels: [bug] });
    // A message in another org with the same ObjectId (can't happen, but the
    // pull is org-scoped regardless).
    const foreign = (
      await MessageModel.create({ content: "f", createdFor: w.outsider, organizationId: w.other, labels: [bug] })
    )._id as Id;
    as(w.owner);
    const res = await remove(bug);
    expect(await res.json()).toEqual({ success: true, removedFrom: 2 });
    expect(((await rawDoc(both))!.labels as Id[]).map(String)).toEqual([String(idea)]);
    expect(await rawDoc(only)).not.toHaveProperty("labels");
    expect(((await rawDoc(foreign))!.labels as Id[]).map(String)).toEqual([String(bug)]);
    const org = await OrganizationModel.findById(w.org);
    expect(org!.labels!.map((l) => String(l._id))).not.toContain(String(bug));
    expect(await AuditLogModel.countDocuments({ action: "label.deleted" })).toBe(1);
    expect((await remove(bug)).status).toBe(404);
  });

  it("another org's label id → 404 (and it isn't touched)", async () => {
    as(w.owner);
    expect((await remove(w.foreignLabel)).status).toBe(404);
    expect((await update(w.foreignLabel, { name: "mine" })).status).toBe(404);
    const other = await OrganizationModel.findById(w.other);
    expect(other!.labels![0].name).toBe("bug");
  });
});
