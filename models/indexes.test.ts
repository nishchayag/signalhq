import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, stopTestDB } from "@/test-utils/db";
import MessageModel from "@/models/message.model";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import UserModel from "@/models/user.model";
import AiUsageModel from "@/models/aiUsage.model";

beforeAll(startTestDB);
afterAll(stopTestDB);

// Guards the query-path indexes added for hot filters that the existing
// compound indexes couldn't serve. Built by Mongoose autoIndex on init —
// the same thing that happens on app start (no syncIndexes, which would
// drop indexes created outside Mongoose, e.g. by Atlas's Performance Advisor).
async function keysOf<T>(model: mongoose.Model<T>) {
  await model.init();
  return (await model.collection.indexes()).map((i) => JSON.stringify(i.key));
}

describe("query indexes", () => {
  it("Message has questionId-leading and createdFor indexes", async () => {
    const keys = await keysOf(MessageModel);
    expect(keys).toContain(JSON.stringify({ questionId: 1, createdAt: -1 }));
    expect(keys).toContain(JSON.stringify({ createdFor: 1 }));
  });

  it("Membership has a userId-leading index", async () => {
    expect(await keysOf(MembershipModel)).toContain(JSON.stringify({ userId: 1, createdAt: 1 }));
  });

  it("Organization has a createdBy index", async () => {
    expect(await keysOf(OrganizationModel)).toContain(JSON.stringify({ createdBy: 1 }));
  });

  it("AiUsage has a unique per-org/month/feature counter and a TTL", async () => {
    await AiUsageModel.init();
    const indexes = await AiUsageModel.collection.indexes();
    const counter = indexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ organizationId: 1, period: 1, feature: 1 })
    );
    expect(counter?.unique).toBe(true);
    const ttl = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ expiresAt: 1 }));
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("User no longer defines the dead messages array", () => {
    expect(UserModel.schema.path("messages")).toBeUndefined();
  });
});

describe("triage indexes (Phase 2)", () => {
  type IndexInfo = { key: Record<string, unknown>; partialFilterExpression?: unknown; name?: string };
  async function find(key: Record<string, number>) {
    await MessageModel.init();
    const all = (await MessageModel.collection.indexes()) as IndexInfo[];
    return all.find((i) => JSON.stringify(i.key) === JSON.stringify(key));
  }

  it("Message has the partial assignee and labels indexes, and none on readBy", async () => {
    const assignee = await find({ organizationId: 1, assignedTo: 1, createdAt: -1 });
    expect(assignee?.partialFilterExpression).toEqual({ assignedTo: { $exists: true } });
    const labels = await find({ organizationId: 1, labels: 1, createdAt: -1 });
    expect(labels?.partialFilterExpression).toEqual({ labels: { $exists: true } });
    const all = (await MessageModel.collection.indexes()) as IndexInfo[];
    expect(all.some((i) => "readBy" in i.key)).toBe(false);
  });

  it("the planner uses them for assignee=<id> and label=<id> list queries", async () => {
    await MessageModel.init();
    const orgId = new mongoose.Types.ObjectId();
    const who = new mongoose.Types.ObjectId();
    const label = new mongoose.Types.ObjectId();
    await MessageModel.create([
      { content: "a", createdFor: who, organizationId: orgId, assignedTo: who, labels: [label] },
      { content: "b", createdFor: who, organizationId: orgId },
    ]);
    const usedIndex = async (filter: Record<string, unknown>) => {
      const plan = (await MessageModel.find(filter).sort({ createdAt: -1 }).explain("queryPlanner")) as unknown as {
        queryPlanner: { winningPlan: unknown };
      };
      return JSON.stringify(plan.queryPlanner.winningPlan);
    };
    expect(await usedIndex({ organizationId: orgId, assignedTo: who })).toContain(
      "organizationId_1_assignedTo_1_createdAt_-1"
    );
    expect(await usedIndex({ organizationId: orgId, labels: label })).toContain(
      "organizationId_1_labels_1_createdAt_-1"
    );
    expect(await MessageModel.countDocuments({ organizationId: orgId, assignedTo: who })).toBe(1);
  });
});
