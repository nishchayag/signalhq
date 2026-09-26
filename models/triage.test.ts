import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import MessageModel, { MESSAGE_MAX_LABELS } from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel, { LABEL_COLORS, ORG_MAX_LABELS } from "@/models/organization.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

const oid = () => new mongoose.Types.ObjectId();

describe("Message triage fields", () => {
  it("are absent by default (no empty arrays stored)", async () => {
    const m = await MessageModel.create({ content: "x", createdFor: oid(), organizationId: oid() });
    const raw = await MessageModel.collection.findOne({ _id: m._id as mongoose.Types.ObjectId });
    for (const k of ["readBy", "labels", "archivedAt", "archivedBy", "assignedTo", "assignedAt", "assignedBy"]) {
      expect(raw).not.toHaveProperty(k);
    }
  });

  it(`allows at most ${MESSAGE_MAX_LABELS} labels`, async () => {
    const base = { content: "x", createdFor: oid(), organizationId: oid() };
    const labels = Array.from({ length: MESSAGE_MAX_LABELS }, oid);
    await expect(MessageModel.create({ ...base, labels })).resolves.toBeTruthy();
    await expect(MessageModel.create({ ...base, labels: [...labels, oid()] })).rejects.toThrow(
      /At most 5 labels/
    );
  });

  it("stores assignment and archive fields", async () => {
    const who = oid();
    const m = await MessageModel.create({
      content: "x", createdFor: oid(), organizationId: oid(),
      assignedTo: who, assignedAt: new Date(), assignedBy: who, archivedAt: new Date(), archivedBy: who,
    });
    const back = (await MessageModel.findById(m._id).lean<{ assignedTo?: unknown; archivedAt?: unknown }>())!;
    expect(String(back.assignedTo)).toBe(String(who));
    expect(back.archivedAt).toBeInstanceOf(Date);
  });
});

describe("Membership triage fields", () => {
  it("readSince is optional; notificationsMuted defaults to false (incl. legacy docs)", async () => {
    const m = await MembershipModel.create({ organizationId: oid(), userId: oid(), role: "MEMBER" });
    expect(m.readSince).toBeUndefined();
    expect(m.notificationsMuted).toBe(false);
    const legacy = await MembershipModel.collection.insertOne({
      organizationId: oid(), userId: oid(), role: "MEMBER", createdAt: new Date(), updatedAt: new Date(),
    });
    const loaded = (await MembershipModel.findById(legacy.insertedId))!;
    expect(loaded.notificationsMuted).toBe(false);
  });
});

describe("Organization.labels", () => {
  const org = (labels: unknown) =>
    new OrganizationModel({ name: "Acme", slug: `acme-${Math.random()}`, createdBy: oid(), labels });

  it("is absent by default", async () => {
    const o = await OrganizationModel.create({ name: "Acme", slug: "acme-l", createdBy: oid() });
    const raw = await OrganizationModel.collection.findOne({ _id: o._id as unknown as mongoose.Types.ObjectId });
    expect(raw).not.toHaveProperty("labels");
  });

  it("trims names, gives each label an _id, accepts every palette colour", async () => {
    const o = org(LABEL_COLORS.map((color, i) => ({ name: `  L${i}  `, color })));
    await o.validate();
    expect(o.labels!.map((l) => l.name)).toEqual(["L0", "L1", "L2", "L3"]);
    expect(o.labels!.every((l) => l._id instanceof mongoose.Types.ObjectId)).toBe(true);
  });

  it("rejects an empty or over-long name and an unknown colour", async () => {
    await expect(org([{ name: "   ", color: "mint" }]).validate()).rejects.toThrow();
    await expect(org([{ name: "x".repeat(25), color: "mint" }]).validate()).rejects.toThrow();
    await expect(org([{ name: "ok", color: "red" }]).validate()).rejects.toThrow();
  });

  it(`caps at ${ORG_MAX_LABELS} labels`, async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `L${i}`, color: "blue" }));
    await expect(org(mk(ORG_MAX_LABELS)).validate()).resolves.toBeUndefined();
    await expect(org(mk(ORG_MAX_LABELS + 1)).validate()).rejects.toThrow(/At most 30 labels/);
  });

  it("rejects case-insensitive duplicate names", async () => {
    await expect(
      org([{ name: "Bug", color: "pink" }, { name: " bug ", color: "blue" }]).validate()
    ).rejects.toThrow(/unique/);
  });
});
