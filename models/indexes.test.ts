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
