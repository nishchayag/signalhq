import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
import { aiMock } from "@/test-utils/aiMock";

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { POST as sendOrgMessage } from "@/app/api/o/[orgSlug]/sendMessage/route";
import { POST as submitAnswer } from "@/app/api/questions/submit/[slug]/route";
import { POST as answerInternal } from "@/app/api/questions/[questionId]/answer/route";
import { GET as getMessages } from "@/app/api/getMessages/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import RateLimitHitModel from "@/models/rateLimitHit.model";

beforeAll(startTestDB);
afterEach(async () => {
  // Let any detached enrichment settle before wiping the DB under it.
  await new Promise((r) => setTimeout(r, 50));
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;
let internalQ: mongoose.Types.ObjectId;
let ipSeq = 0;

beforeEach(async () => {
  aiMock.reset();
  aiMock.setObject({ sentiment: "positive", tags: ["praise"] });
  owner = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: owner });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create({ organizationId: orgId, userId: owner, role: "OWNER" });
  await QuestionModel.create({ questionText: "How was it?", userId: owner, organizationId: orgId, slug: "howwas" });
  const iq = await QuestionModel.create({
    questionText: "Internal?", userId: owner, organizationId: orgId, slug: "internalq", visibility: "internal",
  });
  internalQ = iq._id as unknown as mongoose.Types.ObjectId;
});

async function waitFor(check: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timed out");
}
const aiOf = async (filter: Record<string, unknown>) =>
  (await MessageModel.collection.findOne(filter))?.ai as { status: string; attempts: number } | undefined;

const post = (url: string, content: string) =>
  new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({ content }),
    headers: { "x-forwarded-for": `10.0.0.${++ipSeq}` },
  });

const submitters = {
  "org sendMessage": () =>
    sendOrgMessage(post("http://localhost/api/o/acme/sendMessage", "Great quarter, thanks team"), {
      params: Promise.resolve({ orgSlug: "acme" }),
    }),
  "question submit": () =>
    submitAnswer(post("http://localhost/api/questions/submit/howwas", "Great quarter, thanks team"), {
      params: Promise.resolve({ slug: "howwas" }),
    }),
};

describe("submission never depends on AI", () => {
  for (const [name, submit] of Object.entries(submitters)) {
    it(`${name}: enriches after responding`, async () => {
      const res = await submit();
      expect(res.status).toBe(201);
      const { replyToken } = await res.json();
      expect(replyToken).toHaveLength(32);
      await waitFor(async () => (await aiOf({ replyToken }))?.status === "done");
      expect(aiMock.fns.aiObject).toHaveBeenCalledTimes(1);
    });

    it(`${name}: 201 + replyToken when AI throws`, async () => {
      aiMock.fail("all");
      const res = await submit();
      expect(res.status).toBe(201);
      const { replyToken } = await res.json();
      expect(replyToken).toHaveLength(32);
      await waitFor(async () => (await aiOf({ replyToken }))?.status === "failed");
    });

    it(`${name}: 201 + replyToken promptly when AI hangs`, async () => {
      aiMock.hang("all");
      const t0 = Date.now();
      const res = await submit();
      expect(res.status).toBe(201);
      expect((await res.json()).replyToken).toHaveLength(32);
      expect(Date.now() - t0).toBeLessThan(2000);
    });

    it(`${name}: AI off → no ai field, no AI call`, async () => {
      aiMock.disable();
      const res = await submit();
      expect(res.status).toBe(201);
      const { replyToken } = await res.json();
      const doc = await MessageModel.collection.findOne({ replyToken });
      expect(doc).not.toHaveProperty("ai");
      expect(aiMock.fns.aiObject).not.toHaveBeenCalled();
    });
  }

  it("internal answer: only a NEW thread is queued for enrichment", async () => {
    const member = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: orgId, userId: member, role: "MEMBER" });
    getServerSession.mockResolvedValue({ user: { _id: String(member), activeOrgId: String(orgId) } });
    const params = { params: Promise.resolve({ questionId: String(internalQ) }) };

    const first = await answerInternal(post(`http://localhost/api/questions/${internalQ}/answer`, "First answer"), params);
    expect(first.status).toBe(200);
    const filter = { questionId: internalQ, authorUserId: member };
    await waitFor(async () => (await aiOf(filter))?.status === "done");

    const again = await answerInternal(
      post(`http://localhost/api/questions/${internalQ}/answer`, "Follow-up"),
      { params: Promise.resolve({ questionId: String(internalQ) }) }
    );
    expect(again.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(aiMock.fns.aiObject).toHaveBeenCalledTimes(1);
  });
});

describe("lazy sweep on dashboard reads", () => {
  it("runs after a read, at most once per org per 2 minutes", async () => {
    getServerSession.mockResolvedValue({ user: { _id: String(owner), activeOrgId: String(orgId) } });
    const base = { createdFor: owner, organizationId: orgId, ai: { status: "pending", attempts: 0 } };
    const a = await MessageModel.create({ ...base, content: "first" });

    const res = await getMessages(new NextRequest("http://localhost/api/getMessages"));
    expect(res.status).toBe(200);
    await waitFor(async () => (await aiOf({ _id: a._id }))?.status === "done");

    const b = await MessageModel.create({ ...base, content: "second" });
    expect((await getMessages(new NextRequest("http://localhost/api/getMessages"))).status).toBe(200);
    await waitFor(async () => {
      const hit = await RateLimitHitModel.findOne({ key: `enrichSweep:${orgId}` });
      return hit?.count === 2;
    });
    await new Promise((r) => setTimeout(r, 100));
    expect((await aiOf({ _id: b._id }))?.status).toBe("pending");
    expect(aiMock.fns.aiObject).toHaveBeenCalledTimes(1);
  });

  it("the read itself returns before a hanging sweep", async () => {
    aiMock.hang("all");
    getServerSession.mockResolvedValue({ user: { _id: String(owner), activeOrgId: String(orgId) } });
    await MessageModel.create({
      content: "x", createdFor: owner, organizationId: orgId, ai: { status: "pending", attempts: 0 },
    });
    const t0 = Date.now();
    const res = await getMessages(new NextRequest("http://localhost/api/getMessages"));
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
