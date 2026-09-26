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
import { GET as getSubmit, POST as postSubmit } from "@/app/api/questions/submit/[slug]/route";
import { POST as answerInternal } from "@/app/api/questions/[questionId]/answer/route";
import { GET as exportMessages } from "@/app/api/messages/export/route";
import { GET as getReceipt } from "@/app/api/r/[replyToken]/route";
import { buildMessageListFilter } from "@/lib/messageListQuery";
import { messagesToCsv } from "@/lib/csv";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  // Let any detached enrichment/notification settle before wiping the DB.
  await new Promise((r) => setTimeout(r, 50));
  await clearTestDB();
  getServerSession.mockReset();
  vi.restoreAllMocks();
});
afterAll(stopTestDB);

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;
let ipSeq = 0;

const OPTIONS = [
  { id: "optred", label: "Red" },
  { id: "optgrn", label: "=Green" },
  { id: "optblu", label: "Blue, dark" },
];

beforeEach(async () => {
  aiMock.reset();
  aiMock.setObject({ sentiment: "positive", tags: ["praise"] });
  const user = await UserModel.create({
    name: "Owner",
    username: "owner1",
    email: "owner1@example.com",
    password: "x".repeat(20),
    isVerified: true,
  });
  owner = user._id as unknown as mongoose.Types.ObjectId;
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: owner });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create({ organizationId: orgId, userId: owner, role: "OWNER" });
});

async function makeQuestion(slug: string, extra: Record<string, unknown> = {}) {
  const q = await QuestionModel.create({
    questionText: "How was the offsite?",
    userId: owner,
    organizationId: orgId,
    slug,
    ...extra,
  });
  return q;
}

const submit = (slug: string, body: unknown) =>
  postSubmit(
    new NextRequest(`http://localhost/api/questions/submit/${slug}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": `10.1.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` },
    }),
    { params: Promise.resolve({ slug }) }
  );

const fetchConfig = async (slug: string) => {
  const res = await getSubmit(new NextRequest(`http://localhost/api/questions/submit/${slug}`), {
    params: Promise.resolve({ slug }),
  });
  return { status: res.status, json: await res.json() };
};

const rawMessage = (filter: Record<string, unknown>) => MessageModel.collection.findOne(filter);

describe("submit GET: public config", () => {
  it("returns the typed config and closed:null, never counts or the cap", async () => {
    await makeQuestion("multiq", {
      type: "multi",
      config: { options: OPTIONS, maxSelections: 2, allowComment: true },
      maxResponses: 10,
    });
    const { status, json } = await fetchConfig("multiq");
    expect(status).toBe(200);
    expect(json.question).toMatchObject({
      username: "owner1",
      closed: null,
      closesAt: null,
      config: { type: "multi", allowComment: true, options: OPTIONS, maxSelections: 2 },
    });
    expect(JSON.stringify(json)).not.toMatch(/responseCount|maxResponses/);
  });

  it("text questions report type text", async () => {
    await makeQuestion("textq");
    const { json } = await fetchConfig("textq");
    expect(json.question.config).toEqual({ type: "text", allowComment: true });
  });
});

describe("submit POST: each type", () => {
  it("text: content only, no answer", async () => {
    await makeQuestion("textq");
    const res = await submit("textq", { content: "Loved it" });
    expect(res.status).toBe(201);
    const { replyToken } = await res.json();
    const doc = await rawMessage({ replyToken });
    expect(doc?.content).toBe("Loved it");
    expect(doc).not.toHaveProperty("answer");
    expect(res.status).toBe(201);
    expect((await submit("textq", { score: 4 })).status).toBe(400);
  });

  it("rating: score + optional comment", async () => {
    await makeQuestion("rateq", { type: "rating" });
    const res = await submit("rateq", { score: 4, content: "Pretty good" });
    expect(res.status).toBe(201);
    const doc = await rawMessage({ replyToken: (await res.json()).replyToken });
    expect(doc?.answer).toEqual({ kind: "rating", score: 4 });
    expect(doc?.content).toBe("Pretty good");
    expect((await submit("rateq", { score: 6 })).status).toBe(400);
    expect((await submit("rateq", { content: "no score" })).status).toBe(400);
  });

  it("nps: 0 is a valid score; comments refused when disabled", async () => {
    await makeQuestion("npsq", { type: "nps", config: { allowComment: false } });
    const res = await submit("npsq", { score: 0 });
    expect(res.status).toBe(201);
    const doc = await rawMessage({ replyToken: (await res.json()).replyToken });
    expect(doc?.answer).toEqual({ kind: "nps", score: 0 });
    expect(doc?.content).toBe("");
    expect((await submit("npsq", { score: 9, content: "why" })).status).toBe(400);
  });

  it("single: one known option, label snapshot", async () => {
    await makeQuestion("singleq", { type: "single", config: { options: OPTIONS } });
    const res = await submit("singleq", { choices: ["optblu"] });
    expect(res.status).toBe(201);
    const doc = await rawMessage({ replyToken: (await res.json()).replyToken });
    expect(doc?.answer).toEqual({ kind: "single", choices: ["optblu"], labels: ["Blue, dark"] });
    expect((await submit("singleq", { choices: ["optred", "optblu"] })).status).toBe(400);
    expect((await submit("singleq", { choices: ["forged"] })).status).toBe(400);
  });

  it("multi: up to maxSelections", async () => {
    await makeQuestion("multiq", { type: "multi", config: { options: OPTIONS, maxSelections: 2 } });
    const res = await submit("multiq", { choices: ["optblu", "optred"] });
    expect(res.status).toBe(201);
    const doc = await rawMessage({ replyToken: (await res.json()).replyToken });
    expect(doc?.answer).toEqual({
      kind: "multi",
      choices: ["optred", "optblu"],
      labels: ["Red", "Blue, dark"],
    });
    expect((await submit("multiq", { choices: ["optred", "optgrn", "optblu"] })).status).toBe(400);
  });

  it("increments responseCount once per accepted response", async () => {
    const q = await makeQuestion("rateq", { type: "rating" });
    await submit("rateq", { score: 3 });
    await submit("rateq", { score: 9 }); // invalid — no slot taken
    expect((await QuestionModel.findById(q._id).lean())?.responseCount).toBe(1);
  });
});

describe("atomic cap", () => {
  it("10 parallel submits against a cap of 3 → exactly 3 succeed", async () => {
    const q = await makeQuestion("capq", { type: "rating", maxResponses: 3 });
    const results = await Promise.all(Array.from({ length: 10 }, () => submit("capq", { score: 5 })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 410)).toHaveLength(7);
    expect(await MessageModel.countDocuments({ questionId: q._id })).toBe(3);
    expect((await QuestionModel.findById(q._id).lean())?.responseCount).toBe(3);
    const closedBody = await results.find((r) => r.status === 410)!.json();
    expect(closedBody.code).toBe("QUESTION_CLOSED");
  });

  it("rolls the slot back when the message save fails", async () => {
    const q = await makeQuestion("capq", { type: "rating", maxResponses: 1 });
    vi.spyOn(MessageModel.prototype, "save").mockRejectedValueOnce(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await submit("capq", { score: 2 });
    expect(failed.status).toBe(500);
    expect((await QuestionModel.findById(q._id).lean())?.responseCount).toBe(0);
    // The slot is free again: the next submission takes it.
    expect((await submit("capq", { score: 2 })).status).toBe(201);
    expect((await submit("capq", { score: 2 })).status).toBe(410);
  });
});

describe("closed questions", () => {
  it("past close date: GET 200 closed:date, POST 410", async () => {
    await makeQuestion("oldq", { type: "rating", closesAt: new Date(Date.now() - 60_000) });
    const { status, json } = await fetchConfig("oldq");
    expect(status).toBe(200);
    expect(json.question.closed).toEqual({ reason: "date" });
    expect(json.question.guardAvailable).toBe(false);
    const res = await submit("oldq", { score: 3 });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("QUESTION_CLOSED");
  });

  it("cap reached: GET closed:cap, POST 410", async () => {
    await makeQuestion("fullq", { maxResponses: 2, responseCount: 2 });
    expect((await fetchConfig("fullq")).json.question.closed).toEqual({ reason: "cap" });
    expect((await submit("fullq", { content: "hello there" })).status).toBe(410);
  });
});

describe("AI enrichment only with a comment", () => {
  it("a rating with no comment gets no ai field and no AI call", async () => {
    await makeQuestion("rateq", { type: "rating" });
    const res = await submit("rateq", { score: 5 });
    const { replyToken } = await res.json();
    await new Promise((r) => setTimeout(r, 100));
    expect(await rawMessage({ replyToken })).not.toHaveProperty("ai");
    expect(aiMock.fns.aiObject).not.toHaveBeenCalled();
    expect(aiMock.fns.aiModerate).not.toHaveBeenCalled();
  });

  it("a rating with a comment is queued for enrichment", async () => {
    await makeQuestion("rateq", { type: "rating" });
    const res = await submit("rateq", { score: 5, content: "Great speakers" });
    const { replyToken } = await res.json();
    const doc = await rawMessage({ replyToken });
    expect(doc?.ai).toBeDefined();
  });
});

describe("internal answer route", () => {
  let memberA: mongoose.Types.ObjectId;
  let memberB: mongoose.Types.ObjectId;
  beforeEach(async () => {
    memberA = new mongoose.Types.ObjectId();
    memberB = new mongoose.Types.ObjectId();
    await MembershipModel.create([
      { organizationId: orgId, userId: memberA, role: "MEMBER" },
      { organizationId: orgId, userId: memberB, role: "MEMBER" },
    ]);
  });
  const answer = (qid: unknown, as: mongoose.Types.ObjectId, body: unknown) => {
    getServerSession.mockResolvedValue({ user: { _id: String(as), activeOrgId: String(orgId) } });
    return answerInternal(
      new NextRequest(`http://localhost/api/questions/${qid}/answer`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ questionId: String(qid) }) }
    );
  };

  it("typed first answer, text follow-up; the cap applies to new threads only", async () => {
    const q = await makeQuestion("intq", { visibility: "internal", type: "nps", maxResponses: 1 });
    expect((await answer(q._id, memberA, { score: 8 })).status).toBe(200);
    const thread = await rawMessage({ questionId: q._id, authorUserId: memberA });
    expect(thread?.answer).toEqual({ kind: "nps", score: 8 });
    expect(thread).not.toHaveProperty("ai");

    // Follow-up on the capped question: allowed, free text, no new slot.
    expect((await answer(q._id, memberA, { content: "More detail" })).status).toBe(200);
    expect((await answer(q._id, memberA, { score: 3 })).status).toBe(400);
    expect((await QuestionModel.findById(q._id).lean())?.responseCount).toBe(1);

    // A second member's new thread: the cap is full.
    const res = await answer(q._id, memberB, { score: 9 });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("QUESTION_CLOSED");
  });
});

describe("downstream", () => {
  it("receipt turns carry the answer", async () => {
    await makeQuestion("singleq", { type: "single", config: { options: OPTIONS } });
    const { replyToken } = await (await submit("singleq", { choices: ["optred"] })).json();
    const res = await getReceipt(new NextRequest(`http://localhost/api/r/${replyToken}`), {
      params: Promise.resolve({ replyToken }),
    });
    const { turns } = await res.json();
    expect(turns[0]).toMatchObject({
      authorRole: "sender",
      content: "",
      answer: { kind: "single", choices: ["optred"], labels: ["Red"] },
    });
  });

  it("typed CSV: Answer, Score, Comment columns, all escaped", async () => {
    const q = await makeQuestion("multiq", { type: "multi", config: { options: OPTIONS } });
    await submit("multiq", { choices: ["optgrn", "optblu"], content: '-1, "meh"' });
    getServerSession.mockResolvedValue({ user: { _id: String(owner), activeOrgId: String(orgId) } });
    const res = await exportMessages(
      new NextRequest(`http://localhost/api/messages/export?questionId=${q._id}`)
    );
    expect(res.status).toBe(200);
    const [header, row] = (await res.text()).split("\n");
    expect(header).toBe("Answer,Score,Comment,Submitted At,Replies,Last Reply At");
    // "=Green, Blue, dark": formula-neutralized and quoted; comment quoted
    // with a neutralized leading "-" and doubled quotes; blank score.
    expect(row.startsWith(`"'=Green, Blue, dark",,"'-1, ""meh""",`)).toBe(true);
  });

  it("CSV score column for scale answers", () => {
    const csv = messagesToCsv(
      [{ content: "", createdAt: new Date("2026-01-01T00:00:00Z"), answer: { kind: "nps", score: 7 } }],
      { typed: true }
    );
    expect(csv.split("\n")[1]).toBe("7/10,7,,2026-01-01T00:00:00.000Z,,");
  });

  it("score and choice list filters", async () => {
    const q = await makeQuestion("npsq", { type: "nps" });
    for (const score of [0, 3, 6, 7, 9, 10]) await submit("npsq", { score });
    const viewer = { userId: String(owner), role: "OWNER" as const };
    const count = (qs: string) =>
      MessageModel.countDocuments(
        buildMessageListFilter({ base: { questionId: q._id }, searchParams: new URLSearchParams(qs), viewer })
      );
    expect(await count("score=0-6")).toBe(3);
    expect(await count("score=9")).toBe(1);
    expect(await count("score=7-8")).toBe(1);
    expect(await count("score=6-2")).toBe(0);
    expect(await count("score=abc")).toBe(0);
    expect(await count("score=11")).toBe(0);

    const sq = await makeQuestion("multiq", { type: "multi", config: { options: OPTIONS } });
    await submit("multiq", { choices: ["optred", "optblu"] });
    await submit("multiq", { choices: ["optblu"] });
    const countChoice = (qs: string) =>
      MessageModel.countDocuments(
        buildMessageListFilter({ base: { questionId: sq._id }, searchParams: new URLSearchParams(qs), viewer })
      );
    expect(await countChoice("choice=optblu")).toBe(2);
    expect(await countChoice("choice=optred")).toBe(1);
    expect(await countChoice("choice=$bad")).toBe(0);
  });
});
