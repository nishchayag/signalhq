import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { aiMock } from "@/test-utils/aiMock";
import { GET as getMessages } from "@/app/api/getMessages/route";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import { applyCutoff, chooseStrategy, cosine, semanticSearch } from "@/lib/semanticSearch";
import { backfillEmbeddings } from "@/lib/aiEnrichment";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import AiUsageModel from "@/models/aiUsage.model";
import RateLimitHitModel from "@/models/rateLimitHit.model";
import { periodOf } from "@/lib/aiQuota";

beforeAll(startTestDB);
beforeEach(() => {
  aiMock.reset();
  // The query "burnout" embeds to the x axis; see vec().
  aiMock.setEmbed((texts) => texts.map(() => vec(1, 0)));
});
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  delete process.env.ATLAS_VECTOR_INDEX;
});
afterAll(stopTestDB);

/** 4-dim vector in the x/y plane: cosine to the query is x / |(x, y)|. */
function vec(x: number, y: number): Float32Array {
  return new Float32Array([x, y, 0, 0]);
}

type Id = mongoose.Types.ObjectId;
let seq = 0;

async function createOrg() {
  const ownerId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: `acme-${seq++}`, createdBy: ownerId });
  await MembershipModel.create({ organizationId: org._id, userId: ownerId, role: "OWNER" });
  return { orgId: org._id as unknown as Id, ownerId };
}

async function addMember(orgId: Id) {
  const userId = new mongoose.Types.ObjectId();
  await MembershipModel.create({ organizationId: orgId, userId, role: "MEMBER" });
  return userId;
}

async function msg(
  orgId: Id,
  content: string,
  v: Float32Array | null,
  extra: Record<string, unknown> = {}
) {
  const m = await MessageModel.create({
    content,
    createdFor: new mongoose.Types.ObjectId(),
    organizationId: orgId,
    ...extra,
  });
  if (v) {
    await MessageModel.collection.updateOne(
      { _id: m._id as Id },
      { $set: { embedding: mongoose.mongo.Binary.fromFloat32Array(v), embeddingModel: "mistral-embed" } }
    );
  }
  return m;
}

function signIn(userId: Id, orgId: Id) {
  getServerSession.mockResolvedValue({ user: { _id: String(userId), activeOrgId: String(orgId) } });
}

const generalReq = (q = "burnout", mode: string | null = "semantic") => {
  const u = new URL("http://localhost/api/getMessages");
  if (q) u.searchParams.set("q", q);
  if (mode) u.searchParams.set("mode", mode);
  return new NextRequest(u);
};

async function searchGeneral(q = "burnout") {
  const res = await getMessages(generalReq(q));
  return { status: res.status, body: await res.json() };
}

async function searchQuestion(questionId: unknown, q = "burnout") {
  const u = new URL(`http://localhost/api/questions/${questionId}`);
  u.searchParams.set("q", q);
  u.searchParams.set("mode", "semantic");
  const res = await getQuestion(new NextRequest(u), {
    params: Promise.resolve({ questionId: String(questionId) }),
  });
  return { status: res.status, body: await res.json() };
}

const contents = (body: { messages: { content: string }[] }) => body.messages.map((m) => m.content);

describe("cosine", () => {
  it("scores identical 1, orthogonal 0, and a length mismatch 0", () => {
    const q = vec(1, 0);
    expect(cosine(q, 1, vec(2, 0))).toBeCloseTo(1);
    expect(cosine(q, 1, vec(0, 3))).toBeCloseTo(0);
    expect(cosine(q, 1, new Float32Array([1, 0]))).toBe(0);
  });
});

describe("applyCutoff", () => {
  const s = (...xs: number[]) => xs.map((score) => ({ score }));
  it("keeps hits above the floor and within the window of the best, best first", () => {
    // Measured mistral-embed shape: one real hit a little above the pack.
    expect(applyCutoff(s(0.57, 0.6247, 0.5637), { minScore: 0.6, window: 0.06, limit: 20 })).toEqual(s(0.6247));
    expect(applyCutoff(s(0.6761, 0.7693, 0.6718), { minScore: 0.6, window: 0.06, limit: 20 })).toEqual(s(0.7693));
    expect(applyCutoff(s(0.65, 0.63, 0.5), { minScore: 0.6, window: 0.06, limit: 20 })).toEqual(s(0.65, 0.63));
    expect(applyCutoff(s(0.55, 0.5), { minScore: 0.6, window: 0.06, limit: 20 })).toEqual([]);
    expect(applyCutoff(s(0.9, 0.89, 0.88), { minScore: 0.6, window: 0.06, limit: 2 })).toEqual(s(0.9, 0.89));
  });
});

describe("semantic search on getMessages", () => {
  it("never returns another org's message, even with an identical vector", async () => {
    const a = await createOrg();
    const b = await createOrg();
    await msg(a.orgId, "A: exhausted", vec(1, 0));
    await msg(b.orgId, "B: burnout is real", vec(1, 0));
    signIn(a.ownerId, a.orgId);
    const { status, body } = await searchGeneral();
    expect(status).toBe(200);
    expect(contents(body)).toEqual(["A: exhausted"]);
    expect(body).toMatchObject({ semantic: true, hasMore: false, nextCursor: null, truncated: false });
    expect(JSON.stringify(body)).not.toContain("embedding");
  });

  it("orders by score and drops results outside the floor/window", async () => {
    const { orgId, ownerId } = await createOrg();
    await msg(orgId, "close", vec(1, 0.2)); // ~0.98
    await msg(orgId, "closest", vec(1, 0)); // 1.0
    await msg(orgId, "medium", vec(1, 0.9)); // ~0.74 — above the floor, outside the window
    await msg(orgId, "far", vec(1, 3)); // ~0.32
    await msg(orgId, "unembedded", null);
    signIn(ownerId, orgId);
    const { body } = await searchGeneral();
    expect(contents(body)).toEqual(["closest", "close"]);
  });

  it("returns nothing when no message clears the absolute floor", async () => {
    const { orgId, ownerId } = await createOrg();
    await msg(orgId, "unrelated", vec(1, 1.5)); // ~0.55
    signIn(ownerId, orgId);
    const { body } = await searchGeneral();
    expect(body.messages).toEqual([]);
  });

  it("returns MEMBER-safe AI views", async () => {
    const { orgId } = await createOrg();
    const member = await addMember(orgId);
    await msg(orgId, "tired", vec(1, 0), {
      ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"], toxicity: 0.9, pii: 0.8, piiFlag: true },
    });
    signIn(member, orgId);
    const { body } = await searchGeneral();
    expect(body.messages[0].ai).toEqual({ sentiment: "negative", tags: ["workload"] });
  });

  it("caps candidates at the most recent N and flags truncation", async () => {
    const { orgId } = await createOrg();
    const old = await msg(orgId, "old match", vec(1, 0));
    await MessageModel.updateOne({ _id: old._id }, { createdAt: new Date(Date.now() - 86_400_000) });
    await msg(orgId, "new 1", vec(1, 0.1));
    await msg(orgId, "new 2", vec(1, 0.1));
    const r = await semanticSearch({
      filter: { organizationId: String(orgId), questionId: null },
      queryText: "burnout",
      orgId,
      plan: "FREE",
      candidateCap: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.truncated).toBe(true);
    expect((r.messages as { content: string }[]).map((m) => m.content).sort()).toEqual(["new 1", "new 2"]);

    const all = await semanticSearch({
      filter: { organizationId: String(orgId), questionId: null },
      queryText: "burnout",
      orgId,
      plan: "FREE",
      candidateCap: 3,
    });
    expect(all.ok && all.truncated).toBe(true);
    const roomy = await semanticSearch({
      filter: { organizationId: String(orgId), questionId: null },
      queryText: "burnout",
      orgId,
      plan: "FREE",
      candidateCap: 4,
    });
    expect(roomy.ok && roomy.truncated).toBe(false);
  });

  it("leaves the regex path unchanged when mode is absent", async () => {
    const { orgId, ownerId } = await createOrg();
    await msg(orgId, "burnout here", vec(0, 1));
    await msg(orgId, "exhausted", vec(1, 0));
    signIn(ownerId, orgId);
    const res = await getMessages(generalReq("burnout", null));
    const body = await res.json();
    expect(contents(body)).toEqual(["burnout here"]);
    expect(body.semantic).toBeUndefined();
    expect(aiMock.fns.aiEmbed).not.toHaveBeenCalled();
    expect(await AiUsageModel.countDocuments()).toBe(0);
  });

  it("charges one search unit and 429s AI_QUOTA_EXHAUSTED when out", async () => {
    const { orgId, ownerId } = await createOrg();
    signIn(ownerId, orgId);
    expect((await searchGeneral()).status).toBe(200);
    const usage = await AiUsageModel.findOne({ organizationId: orgId, feature: "search" });
    expect(usage?.count).toBe(1);

    await AiUsageModel.updateOne({ _id: usage!._id }, { count: 100 });
    const { status, body } = await searchGeneral();
    expect(status).toBe(429);
    expect(body.code).toBe("AI_QUOTA_EXHAUSTED");
  });

  it("refunds the unit when embedding the query fails", async () => {
    const { orgId, ownerId } = await createOrg();
    signIn(ownerId, orgId);
    aiMock.fail("aiEmbed");
    const { status } = await searchGeneral();
    expect(status).toBe(502);
    const usage = await AiUsageModel.findOne({ organizationId: orgId, feature: "search", period: periodOf() });
    expect(usage?.count ?? 0).toBe(0);
  });

  it("503s when AI is disabled, and 400s a too-short query", async () => {
    const { orgId, ownerId } = await createOrg();
    signIn(ownerId, orgId);
    expect((await searchGeneral("ab")).status).toBe(400);
    aiMock.disable();
    expect((await searchGeneral()).status).toBe(503);
  });

  it("rate-limits 20 searches per 10 minutes per user", async () => {
    const { orgId, ownerId } = await createOrg();
    signIn(ownerId, orgId);
    const windowStart = new Date(Math.floor(Date.now() / 600_000) * 600_000);
    await RateLimitHitModel.create({
      key: `search:${ownerId}`,
      windowStart,
      count: 20,
      expiresAt: new Date(windowStart.getTime() + 660_000),
    });
    expect((await searchGeneral()).status).toBe(429);
    expect(aiMock.fns.aiEmbed).not.toHaveBeenCalled();
  });
});

describe("semantic search on questions/[id]", () => {
  it("excludes member threads and other questions", async () => {
    const { orgId, ownerId } = await createOrg();
    const q = await QuestionModel.create({ questionText: "How?", userId: ownerId, organizationId: orgId, slug: "how" });
    const other = await QuestionModel.create({ questionText: "Other?", userId: ownerId, organizationId: orgId, slug: "oth" });
    await msg(orgId, "anon answer", vec(1, 0), { questionId: q._id });
    await msg(orgId, "member thread", vec(1, 0), { questionId: q._id, authorType: "member", authorUserId: ownerId });
    await msg(orgId, "other question", vec(1, 0), { questionId: other._id });
    await msg(orgId, "general", vec(1, 0));
    signIn(ownerId, orgId);
    const { status, body } = await searchQuestion(q._id);
    expect(status).toBe(200);
    expect(contents(body)).toEqual(["anon answer"]);
    expect(body.question.slug).toBe("how");
    expect(body.semantic).toBe(true);
  });

  it("general search never includes question answers or member threads", async () => {
    const { orgId, ownerId } = await createOrg();
    const q = await QuestionModel.create({ questionText: "How?", userId: ownerId, organizationId: orgId, slug: "how2" });
    await msg(orgId, "answer", vec(1, 0), { questionId: q._id });
    await msg(orgId, "general", vec(1, 0));
    signIn(ownerId, orgId);
    expect(contents((await searchGeneral()).body)).toEqual(["general"]);
  });

  it("hides a team question from a MEMBER outside the team (404, nothing searched)", async () => {
    const { orgId, ownerId } = await createOrg();
    const outsider = await addMember(orgId);
    const insider = await addMember(orgId);
    const team = await TeamModel.create({ organizationId: orgId, name: "Eng", slug: "eng", members: [insider], createdBy: ownerId });
    const q = await QuestionModel.create({
      questionText: "Team?", userId: ownerId, organizationId: orgId, slug: "team", teamId: team._id,
    });
    await msg(orgId, "team answer", vec(1, 0), { questionId: q._id, teamId: team._id });

    signIn(outsider, orgId);
    expect((await searchQuestion(q._id)).status).toBe(404);
    expect(aiMock.fns.aiEmbed).not.toHaveBeenCalled();

    signIn(insider, orgId);
    const ok = await searchQuestion(q._id);
    expect(contents(ok.body)).toEqual(["team answer"]);
  });
});

describe("strategy selection", () => {
  it("uses $vectorSearch only when ATLAS_VECTOR_INDEX is set", async () => {
    const { orgId } = await createOrg();
    await msg(orgId, "match", vec(1, 0));
    const spy = vi.spyOn(MessageModel.collection, "aggregate");
    const filter = { organizationId: String(orgId), questionId: null };

    expect(chooseStrategy()).toBe("scan");
    const scanned = await semanticSearch({ filter, queryText: "burnout", orgId, plan: "FREE" });
    expect(spy).not.toHaveBeenCalled();
    expect(scanned.ok && scanned.messages.length).toBe(1);

    process.env.ATLAS_VECTOR_INDEX = "messages_embedding";
    expect(chooseStrategy()).toBe("vectorSearch");
    const target = await MessageModel.findOne({ content: "match" });
    spy.mockReturnValueOnce({
      toArray: async () => [{ _id: target!._id, score: 0.99 }],
    } as unknown as ReturnType<typeof MessageModel.collection.aggregate>);
    const vs = await semanticSearch({ filter, queryText: "burnout", orgId, plan: "FREE" });
    expect(spy).toHaveBeenCalledTimes(1);
    const stage = (spy.mock.calls[0][0] as Record<string, Record<string, unknown>>[])[0].$vectorSearch;
    expect(stage.index).toBe("messages_embedding");
    expect(stage.path).toBe("embedding");
    expect(stage.filter).toEqual({ organizationId: orgId, questionId: null });
    expect(vs.ok && (vs.messages as { content: string }[]).map((m) => m.content)).toEqual(["match"]);
    spy.mockRestore();
  });
});

describe("backfillEmbeddings", () => {
  it("embeds done-but-unembedded messages in one batch without charging quota", async () => {
    const { orgId } = await createOrg();
    const done = await msg(orgId, "done no vec", null, { ai: { status: "done", attempts: 1 } });
    await msg(orgId, "pending", null, { ai: { status: "pending", attempts: 0 } });
    await msg(orgId, "has vec", vec(0, 1), { ai: { status: "done", attempts: 1 } });
    const r = await backfillEmbeddings({ orgId, deadline: Date.now() + 20_000 });
    expect(r).toMatchObject({ candidates: 1, embedded: 1 });
    expect(aiMock.fns.aiEmbed).toHaveBeenCalledTimes(1);
    const raw = await MessageModel.collection.findOne({ _id: done._id as Id });
    expect(raw?.embedding.toFloat32Array().length).toBe(4);
    expect(await AiUsageModel.countDocuments({ feature: "enrich" })).toBe(0);
  });
});
