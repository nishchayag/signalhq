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

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as getMessages } from "@/app/api/getMessages/route";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import { GET as getThread } from "@/app/api/messages/[messageId]/reply/route";
import { GET as getOwnThread } from "@/app/api/questions/[questionId]/answer/route";
import { GET as getReplies } from "@/app/api/questions/[questionId]/replies/route";
import { GET as exportMessages } from "@/app/api/messages/export/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

const AI = {
  status: "done",
  attempts: 1,
  lockedAt: new Date(),
  sentiment: "negative",
  tags: ["workload"],
  toxicity: 0.91,
  pii: 0.66,
  piiFlag: true,
  model: "ministral-8b-latest",
  enrichedAt: new Date(),
};

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;
let member: mongoose.Types.ObjectId;
let publicQ: mongoose.Types.ObjectId;
let internalQ: mongoose.Types.ObjectId;
let threadId: mongoose.Types.ObjectId;

async function withEmbedding(id: unknown) {
  await MessageModel.collection.updateOne(
    { _id: id as mongoose.Types.ObjectId },
    {
      $set: {
        embedding: mongoose.mongo.Binary.fromFloat32Array(new Float32Array([0.1, 0.2])),
        embeddingModel: "mistral-embed",
      },
    }
  );
}

beforeEach(async () => {
  const [o, m] = await UserModel.create([
    { name: "Owner", username: "ownerx", email: "o@x.com", password: "x", isVerified: true },
    { name: "Mem", username: "memberx", email: "m@x.com", password: "x", isVerified: true },
  ]);
  owner = o._id as mongoose.Types.ObjectId;
  member = m._id as mongoose.Types.ObjectId;
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: owner });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create([
    { organizationId: orgId, userId: owner, role: "OWNER" },
    { organizationId: orgId, userId: member, role: "MEMBER" },
  ]);
  const pq = await QuestionModel.create({
    questionText: "Retro?", userId: owner, organizationId: orgId, slug: "retro",
  });
  publicQ = pq._id as unknown as mongoose.Types.ObjectId;
  const iq = await QuestionModel.create({
    questionText: "Internal?", userId: owner, organizationId: orgId, slug: "internal", visibility: "internal",
  });
  internalQ = iq._id as unknown as mongoose.Types.ObjectId;

  const general = await MessageModel.create({
    content: "General gripe", createdFor: owner, organizationId: orgId, ai: AI,
  });
  const answer = await MessageModel.create({
    content: "Question answer", createdFor: owner, organizationId: orgId, questionId: publicQ, ai: AI,
  });
  const thread = await MessageModel.create({
    content: "My private answer", createdFor: owner, organizationId: orgId, questionId: internalQ,
    authorType: "member", authorUserId: member, ai: AI,
  });
  threadId = thread._id as mongoose.Types.ObjectId;
  for (const d of [general, answer, thread]) await withEmbedding(d._id);
});

function as(userId: mongoose.Types.ObjectId) {
  getServerSession.mockResolvedValue({ user: { _id: String(userId), activeOrgId: String(orgId) } });
}
const qp = (questionId: mongoose.Types.ObjectId) => ({ params: Promise.resolve({ questionId: String(questionId) }) });

function expectNoEmbedding(body: unknown) {
  const s = JSON.stringify(body);
  expect(s).not.toContain("embedding");
  expect(s).not.toContain("lockedAt");
  expect(s).not.toContain("attempts");
}

describe("AI fields on dashboard reads", () => {
  it("getMessages: MEMBER sees sentiment/tags only, OWNER also toxicity/pii", async () => {
    as(member);
    const m = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expect(m.messages[0].ai).toEqual({ sentiment: "negative", tags: ["workload"] });
    expectNoEmbedding(m);

    as(owner);
    const o = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expect(o.messages[0].ai).toEqual({
      sentiment: "negative", tags: ["workload"], toxicity: 0.91, pii: 0.66, piiFlag: true,
    });
    expectNoEmbedding(o);
  });

  it("questions/:id GET: same role split", async () => {
    as(member);
    const m = await (await getQuestion(new NextRequest(`http://localhost/api/questions/${publicQ}`), qp(publicQ))).json();
    expect(m.messages[0].ai).toEqual({ sentiment: "negative", tags: ["workload"] });
    expectNoEmbedding(m);

    as(owner);
    const o = await (await getQuestion(new NextRequest(`http://localhost/api/questions/${publicQ}`), qp(publicQ))).json();
    expect(o.messages[0].ai.toxicity).toBe(0.91);
    expectNoEmbedding(o);
  });

  it("member thread: its author never sees ai; OWNER oversight does", async () => {
    const tp = { params: Promise.resolve({ messageId: String(threadId) }) };
    as(member);
    const mine = await (await getThread(new NextRequest(`http://localhost/api/messages/${threadId}/reply`), tp)).json();
    expect(mine.message.content).toBe("My private answer");
    expect(mine.message).not.toHaveProperty("ai");
    expectNoEmbedding(mine);

    const own = await (await getOwnThread(new NextRequest(`http://localhost/api/questions/${internalQ}/answer`), qp(internalQ))).json();
    expect(own.thread.content).toBe("My private answer");
    expect(own.thread).not.toHaveProperty("ai");
    expectNoEmbedding(own);

    as(owner);
    const tp2 = { params: Promise.resolve({ messageId: String(threadId) }) };
    const overseen = await (await getThread(new NextRequest(`http://localhost/api/messages/${threadId}/reply`), tp2)).json();
    expect(overseen.message.ai.piiFlag).toBe(true);
    expectNoEmbedding(overseen);

    const replies = await (await getReplies(new NextRequest(`http://localhost/api/questions/${internalQ}/replies`), qp(internalQ))).json();
    expect(replies.threads[0].ai.toxicity).toBe(0.91);
    expect(replies.threads[0].authorUserId.username).toBe("memberx");
    expectNoEmbedding(replies);
  });

  it("CSV export carries no AI data", async () => {
    as(owner);
    const csv = await (await exportMessages(new NextRequest("http://localhost/api/messages/export"))).text();
    expect(csv).toContain("General gripe");
    expect(csv).not.toMatch(/negative|workload|embedding/);
  });
});
