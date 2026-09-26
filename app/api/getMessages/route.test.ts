import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET } from "@/app/api/getMessages/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/getMessages${query}`);
}

async function makeOrgWithOwner(slug: string) {
  const userId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug, createdBy: userId });
  await MembershipModel.create({ organizationId: org._id, userId, role: "OWNER" });
  return { userId, org };
}

describe("GET /api/getMessages — tag/sentiment filters", () => {
  it("tag= narrows to messages carrying that AI tag", async () => {
    const { userId, org } = await makeOrgWithOwner("acme-1");
    await MessageModel.create({
      content: "Too much on my plate this sprint",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    await MessageModel.create({
      content: "Really love the team culture",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "positive", tags: ["culture"] },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req("?tag=workload"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Too much on my plate this sprint");
  });

  it("sentiment= narrows to messages with that AI sentiment", async () => {
    const { userId, org } = await makeOrgWithOwner("acme-2");
    await MessageModel.create({
      content: "Too much on my plate this sprint",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    await MessageModel.create({
      content: "Really love the team culture",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "positive", tags: ["culture"] },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req("?sentiment=positive"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Really love the team culture");
  });

  it("an unknown tag yields an empty list, not every message", async () => {
    const { userId, org } = await makeOrgWithOwner("acme-3");
    await MessageModel.create({
      content: "Too much on my plate this sprint",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req("?tag=not-a-real-tag"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([]);
  });

  it("an invalid sentiment yields an empty list", async () => {
    const { userId, org } = await makeOrgWithOwner("acme-4");
    await MessageModel.create({
      content: "Too much on my plate this sprint",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req("?sentiment=furious"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([]);
  });

  it("narrows within the caller's own organization, never across it", async () => {
    const a = await makeOrgWithOwner("acme-a");
    const b = await makeOrgWithOwner("acme-b");
    await MessageModel.create({
      content: "Org A is overworked",
      createdFor: a.userId,
      organizationId: a.org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    await MessageModel.create({
      content: "Org B is overworked",
      createdFor: b.userId,
      organizationId: b.org._id,
      questionId: null,
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(a.userId) } });

    const res = await GET(req("?tag=workload"));
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Org A is overworked");
  });

  it("a MEMBER's filtered result carries sentiment+tags but never toxicity/PII", async () => {
    const { userId: ownerId, org } = await makeOrgWithOwner("acme-5");
    const memberId = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: org._id, userId: memberId, role: "MEMBER" });
    await MessageModel.create({
      content: "Too much on my plate this sprint",
      createdFor: ownerId,
      organizationId: org._id,
      questionId: null,
      ai: {
        status: "done",
        attempts: 1,
        sentiment: "negative",
        tags: ["workload"],
        toxicity: 0.9,
        pii: 0.8,
        piiFlag: true,
      },
    });
    getServerSession.mockResolvedValue({ user: { _id: String(memberId) } });

    const res = await GET(req("?tag=workload"));
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].ai).toEqual({ sentiment: "negative", tags: ["workload"] });
  });
});
