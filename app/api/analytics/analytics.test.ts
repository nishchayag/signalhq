import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as overviewGET } from "@/app/api/analytics/overview/route";
import { GET as questionGET } from "@/app/api/analytics/questions/[questionId]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import TeamModel from "@/models/team.model";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  ANALYTICS_RATE_LIMIT,
  analyticsRateKey,
  npsFromCounts,
  parseStatsRange,
} from "@/lib/responseStats";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

const oid = () => new mongoose.Types.ObjectId();

function as(userId: mongoose.Types.ObjectId) {
  getServerSession.mockResolvedValue({ user: { _id: String(userId) } });
}

async function overview(query = "") {
  const res = await overviewGET(new NextRequest(`http://localhost/api/analytics/overview${query}`), {
    params: Promise.resolve({}),
  } as never);
  return { status: res.status, body: await res.json() };
}

async function questionStats(id: string, query = "") {
  const res = await questionGET(
    new NextRequest(`http://localhost/api/analytics/questions/${id}${query}`),
    { params: Promise.resolve({ questionId: id }) }
  );
  return { status: res.status, body: await res.json() };
}

async function makeOrg() {
  const owner = oid();
  const org = await OrganizationModel.create({ name: "Acme", slug: `acme-${owner}`, createdBy: owner });
  await MembershipModel.create({ organizationId: org._id, userId: owner, role: "OWNER" });
  return { org, owner };
}

async function addMember(orgId: unknown, role: "ADMIN" | "MEMBER" = "MEMBER") {
  const userId = oid();
  await MembershipModel.create({ organizationId: orgId, userId, role });
  return userId;
}

async function makeTeam(orgId: unknown, createdBy: unknown, name: string, members: unknown[]) {
  return TeamModel.create({ organizationId: orgId, name, slug: name.toLowerCase(), createdBy, members });
}

let slugN = 0;
async function makeQuestion(orgId: unknown, userId: unknown, extra: Record<string, unknown> = {}) {
  return QuestionModel.create({
    questionText: "How are we doing?",
    userId,
    organizationId: orgId,
    slug: `q${slugN++}`,
    ...extra,
  });
}

function msg(orgId: unknown, createdFor: unknown, extra: Record<string, unknown> = {}) {
  return MessageModel.create({
    content: "feedback",
    createdFor,
    organizationId: orgId,
    createdAt: new Date(),
    ...extra,
  });
}

/** Every key in a JSON value, recursively. */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      allKeys(x, out);
    }
  }
  return out;
}

describe("parseStatsRange", () => {
  it("defaults to UTC and the last 30 days, day buckets", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const r = parseStatsRange(new URLSearchParams(), { now });
    expect(r.ok && r.range).toMatchObject({ tz: "UTC", bucket: "day", clamped: false });
    if (r.ok) expect(r.range.from.toISOString()).toBe("2026-08-27T00:00:00.000Z");
  });

  it("rejects an unknown time zone, a bad bucket and from >= to", () => {
    expect(parseStatsRange(new URLSearchParams("tz=Mars/Olympus")).ok).toBe(false);
    // Mongo's timezone is case-sensitive; Intl canonicalises the case.
    const lower = parseStatsRange(new URLSearchParams("tz=utc"));
    expect(lower.ok && lower.range.tz).toBe("UTC");
    expect(parseStatsRange(new URLSearchParams("bucket=month")).ok).toBe(false);
    expect(parseStatsRange(new URLSearchParams("from=2026-02-31")).ok).toBe(false);
    expect(parseStatsRange(new URLSearchParams("from=2026-09-10&to=2026-09-01")).ok).toBe(false);
  });

  it("reads a local YYYY-MM-DD day in tz, `to` inclusive", () => {
    const r = parseStatsRange(new URLSearchParams("from=2026-09-10&to=2026-09-11&tz=Asia/Kolkata"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.range.from.toISOString()).toBe("2026-09-09T18:30:00.000Z");
    expect(r.range.to.toISOString()).toBe("2026-09-11T18:30:00.000Z");
  });
});

describe("npsFromCounts", () => {
  it("matches a hand count", () => {
    // 10,10,9,9 promoters; 8 passive; 6,2 detractors → 4/7 − 2/7 = 28.57 → 29
    const scores = [10, 10, 9, 9, 8, 6, 2];
    const counts = Array.from({ length: 11 }, (_, s) => ({
      score: s,
      count: scores.filter((x) => x === s).length,
    }));
    expect(npsFromCounts(counts)).toEqual({
      score: 29,
      promoters: 4,
      passives: 1,
      detractors: 2,
      total: 7,
      promoterPct: 57.1,
      detractorPct: 28.6,
    });
  });
});

describe("GET /api/analytics/overview", () => {
  it("401s with no session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await overview()).status).toBe(401);
  });

  it("returns zeros and empty arrays for an empty org (no NaN/null)", async () => {
    const { owner } = await makeOrg();
    as(owner);
    const { status, body } = await overview("?from=2026-09-01&to=2026-09-07");
    expect(status).toBe(200);
    expect(body.totals).toEqual({ messages: 0, question: 0, general: 0 });
    expect(body.volume).toHaveLength(7);
    expect(body.volume.every((p: { total: number }) => p.total === 0)).toBe(true);
    expect(body.byTeam).toEqual([]);
    expect(body.tags).toEqual([]);
    expect(body.sentiment.totals).toEqual({ positive: 0, neutral: 0, negative: 0, mixed: 0 });
    expect(body.sentiment.trend).toHaveLength(7);
    expect(body.triage).toEqual({ unread: 0, archived: 0, assigned: 0, awaitingReply: 0 });
    expect(JSON.stringify(body)).not.toMatch(/null|NaN/);
  });

  it("team-scopes a MEMBER and never counts member private threads", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org._id);
    const teamA = await makeTeam(org._id, owner, "Alpha", [member]);
    const teamB = await makeTeam(org._id, owner, "Beta", []);
    const qA = await makeQuestion(org._id, owner, { teamId: teamA._id });
    const qB = await makeQuestion(org._id, owner, { teamId: teamB._id });
    const qInternal = await makeQuestion(org._id, owner, { visibility: "internal" });
    await msg(org._id, owner, { ai: { status: "done", sentiment: "positive", tags: ["culture"] } });
    await msg(org._id, owner, { questionId: qA._id, teamId: teamA._id });
    await msg(org._id, owner, {
      questionId: qB._id,
      teamId: teamB._id,
      ai: { status: "done", sentiment: "negative", tags: ["workload"] },
    });
    await msg(org._id, owner, {
      questionId: qInternal._id,
      authorType: "member",
      authorUserId: member,
    });

    as(member);
    const m = await overview();
    expect(m.status).toBe(200);
    expect(m.body.totals).toEqual({ messages: 2, question: 1, general: 1 });
    expect(m.body.byTeam.map((t: { name: string | null }) => t.name).sort()).toEqual(
      ["Alpha", null].sort()
    );
    expect(m.body.tags).toEqual([{ tag: "culture", count: 1 }]);
    expect(m.body.sentiment.totals.negative).toBe(0);
    // Another team's id only narrows: zero, not a leak.
    const other = await overview(`?teamId=${teamB._id}`);
    expect(other.body.totals.messages).toBe(0);

    as(owner);
    const o = await overview();
    expect(o.body.totals).toEqual({ messages: 3, question: 2, general: 1 });
    const filtered = await overview(`?teamId=${teamB._id}`);
    expect(filtered.body.totals.messages).toBe(1);
  });

  it("404s a malformed teamId and 400s a bad tz", async () => {
    const { owner } = await makeOrg();
    as(owner);
    expect((await overview("?teamId=nope")).status).toBe(404);
    expect((await overview("?tz=Not/AZone")).status).toBe(400);
  });

  it("buckets a +05:30 00:10 local message on its local day", async () => {
    const { org, owner } = await makeOrg();
    // 2026-09-10T18:40Z is 2026-09-11 00:10 in Asia/Kolkata.
    await msg(org._id, owner, { createdAt: new Date("2026-09-10T18:40:00Z") });
    as(owner);

    const ist = await overview("?from=2026-09-10&to=2026-09-11&tz=Asia/Kolkata&bucket=day");
    // Intl canonicalises (ICU returns the older link name, which Mongo accepts).
    expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(ist.body.range.tz);
    expect(ist.body.volume).toEqual([
      { bucket: "2026-09-10", total: 0, question: 0, general: 0 },
      { bucket: "2026-09-11", total: 1, question: 0, general: 1 },
    ]);

    const utc = await overview("?from=2026-09-10&to=2026-09-11&bucket=day");
    expect(utc.body.volume[0]).toEqual({ bucket: "2026-09-10", total: 1, question: 0, general: 1 });

    // Weeks start Monday: 2026-09-11 local is a Friday → week of 09-07.
    const wk = await overview("?from=2026-09-07&to=2026-09-13&tz=Asia/Kolkata&bucket=week");
    expect(wk.body.volume).toEqual([{ bucket: "2026-09-07", total: 1, question: 0, general: 1 }]);
  });

  it("buckets a message across the America/New_York spring-forward on its local day", async () => {
    const { org, owner } = await makeOrg();
    // 2026-03-08 is the US spring-forward day (2am EST -> 3am EDT at 07:00Z).
    await msg(org._id, owner, { createdAt: new Date("2026-03-08T12:00:00Z") });
    as(owner);
    const r = await overview("?from=2026-03-08&to=2026-03-08&tz=America/New_York&bucket=day");
    expect(r.status).toBe(200);
    expect(r.body.volume).toEqual([{ bucket: "2026-03-08", total: 1, question: 0, general: 1 }]);
  });

  it("buckets a message across the America/New_York fall-back into one 2026-10-26 week", async () => {
    const { org, owner } = await makeOrg();
    // 2026-11-01 is the US fall-back day; its Monday-start week is 2026-10-26.
    await msg(org._id, owner, { createdAt: new Date("2026-11-01T12:00:00Z") });
    as(owner);
    const r = await overview("?from=2026-10-26&to=2026-11-01&tz=America/New_York&bucket=week");
    expect(r.status).toBe(200);
    // Exactly one zero-filled bucket, and it's the one Mongo grouped into:
    // proves the JS-computed zero-fill keys agree with Mongo's $dateTrunc.
    expect(r.body.volume).toEqual([{ bucket: "2026-10-26", total: 1, question: 0, general: 1 }]);
  });

  it("treats an explicit full-ISO 'to' as exclusive", async () => {
    const { org, owner } = await makeOrg();
    await msg(org._id, owner, { createdAt: new Date("2026-09-10T12:00:00.000Z") });
    await msg(org._id, owner, { createdAt: new Date("2026-09-10T11:59:59.999Z") });
    as(owner);
    const r = await overview("?from=2026-09-01&to=2026-09-10T12:00:00.000Z");
    expect(r.status).toBe(200);
    expect(r.body.totals.messages).toBe(1);
  });

  it("caps the range at 12 months", async () => {
    const { org, owner } = await makeOrg();
    await msg(org._id, owner, { createdAt: new Date("2025-06-15T12:00:00Z") });
    await msg(org._id, owner, { createdAt: new Date("2025-10-15T12:00:00Z") });
    as(owner);
    const { status, body } = await overview("?from=2024-01-01&to=2026-08-31");
    expect(status).toBe(200);
    expect(body.range.clamped).toBe(true);
    expect(body.range.from).toBe("2025-09-01T00:00:00.000Z");
    expect(body.range.bucket).toBe("week");
    expect(body.totals.messages).toBe(1);
    expect(body.volume.length).toBeLessThanOrEqual(54);
  });

  it("counts triage state for the viewer", async () => {
    const { org, owner } = await makeOrg();
    const past = new Date(Date.now() - 60_000);
    await MembershipModel.updateOne({ userId: owner }, { readSince: new Date(0) });
    await msg(org._id, owner, { createdAt: past }); // unread
    await msg(org._id, owner, { createdAt: past, readBy: [owner] }); // read
    await msg(org._id, owner, { createdAt: past, archivedAt: new Date() });
    await msg(org._id, owner, { createdAt: past, assignedTo: owner, readBy: [owner] });
    await msg(org._id, owner, { createdAt: past, awaitingOrg: true, readBy: [owner] });
    as(owner);
    const { body } = await overview();
    expect(body.triage).toEqual({ unread: 1, archived: 1, assigned: 1, awaitingReply: 1 });
    expect(body.totals.messages).toBe(5);
  });

  it("never returns toxicity/pii keys", async () => {
    const { org, owner } = await makeOrg();
    await msg(org._id, owner, {
      ai: { status: "done", sentiment: "negative", tags: ["safety"], toxicity: 0.9, pii: 0.8, piiFlag: true },
    });
    as(owner);
    const { body } = await overview();
    expect(body.sentiment.totals.negative).toBe(1);
    const keys = allKeys(body);
    expect(keys.filter((k) => /toxic|pii/i.test(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/toxic|pii/i);
  });

  it("429s past the per-user limit", async () => {
    const { owner } = await makeOrg();
    for (let i = 0; i < ANALYTICS_RATE_LIMIT.limit; i++) {
      await checkRateLimit(analyticsRateKey(String(owner)), ANALYTICS_RATE_LIMIT.limit, ANALYTICS_RATE_LIMIT.windowMs);
    }
    as(owner);
    expect((await overview()).status).toBe(429);
  });
});

describe("GET /api/analytics/questions/[questionId]", () => {
  it("404s a malformed or unknown id", async () => {
    const { owner } = await makeOrg();
    as(owner);
    expect((await questionStats("nope")).status).toBe(404);
    expect((await questionStats(String(oid()))).status).toBe(404);
  });

  it("forbids an internal question without question:viewAllReplies", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org._id);
    const admin = await addMember(org._id, "ADMIN");
    const q = await makeQuestion(org._id, owner, { visibility: "internal" });
    await msg(org._id, owner, { questionId: q._id, authorType: "member", authorUserId: member });

    as(member);
    expect((await questionStats(String(q._id))).status).toBe(403);
    as(admin);
    const ok = await questionStats(String(q._id));
    expect(ok.status).toBe(200);
    expect(ok.body.totals.responses).toBe(1);
  });

  it("404s an org-less question (backfill invariant violation)", async () => {
    const owner = oid();
    const q = await QuestionModel.create({
      questionText: "Legacy?",
      userId: owner,
      slug: `legacy-${slugN++}`,
    });
    as(owner);
    expect((await questionStats(String(q._id))).status).toBe(404);
  });

  it("404s another team's question for a MEMBER", async () => {
    const { org, owner } = await makeOrg();
    const member = await addMember(org._id);
    const team = await makeTeam(org._id, owner, "Beta", []);
    const q = await makeQuestion(org._id, owner, { teamId: team._id });
    as(member);
    expect((await questionStats(String(q._id))).status).toBe(404);
  });

  it("computes NPS against a hand count", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner, { type: "nps" });
    for (const score of [10, 10, 9, 9, 8, 6, 2]) {
      await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "nps", score } });
    }
    as(owner);
    const { status, body } = await questionStats(String(q._id));
    expect(status).toBe(200);
    expect(body.nps).toMatchObject({ score: 29, promoters: 4, passives: 1, detractors: 2, total: 7 });
    expect(body.distribution.kind).toBe("scale");
    expect(body.distribution.counts).toHaveLength(11);
    expect(body.distribution.counts[10]).toEqual({ score: 10, count: 2 });
    expect(body.average).toBe(7.71); // 54 / 7
  });

  it("computes rating average, distribution, comment rate and cap", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner, { type: "rating", maxResponses: 10, responseCount: 5 });
    const rows: [number, string][] = [[5, "great"], [4, ""], [4, "  "], [3, "ok"], [1, ""]];
    for (const [score, content] of rows) {
      await msg(org._id, owner, { questionId: q._id, content, answer: { kind: "rating", score } });
    }
    as(owner);
    const { body } = await questionStats(String(q._id));
    expect(body.average).toBe(3.4);
    expect(body.nps).toBeNull();
    expect(body.distribution).toEqual({
      kind: "scale",
      min: 1,
      max: 5,
      counts: [
        { score: 1, count: 1 },
        { score: 2, count: 0 },
        { score: 3, count: 1 },
        { score: 4, count: 2 },
        { score: 5, count: 1 },
      ],
    });
    expect(body.totals).toEqual({ responses: 5, withComment: 2, commentRate: 0.4 });
    expect(body.cap).toEqual({ responseCount: 5, maxResponses: 10, progress: 0.5 });
  });

  it("counts choices by option id with current labels", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner, {
      type: "multi",
      config: { options: [{ id: "a1", label: "Red" }, { id: "b2", label: "Blue" }, { id: "c3", label: "Green" }] },
    });
    await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "multi", choices: ["a1", "b2"], labels: ["Old red", "Blue"] } });
    await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "multi", choices: ["a1"], labels: ["Old red"] } });
    as(owner);
    const { body } = await questionStats(String(q._id));
    expect(body.distribution).toEqual({
      kind: "choice",
      respondents: 2,
      counts: [
        { optionId: "a1", label: "Red", count: 2 },
        { optionId: "b2", label: "Blue", count: 1 },
        { optionId: "c3", label: "Green", count: 0 },
      ],
    });
    expect(body.average).toBeNull();
  });

  it("counts a single-choice distribution correctly", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner, {
      type: "single",
      config: { options: [{ id: "a1", label: "Red" }, { id: "b2", label: "Blue" }] },
    });
    await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "single", choices: ["a1"], labels: ["Red"] } });
    await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "single", choices: ["b2"], labels: ["Blue"] } });
    await msg(org._id, owner, { questionId: q._id, content: "", answer: { kind: "single", choices: ["a1"], labels: ["Red"] } });
    as(owner);
    const { body } = await questionStats(String(q._id));
    expect(body.distribution).toEqual({
      kind: "choice",
      respondents: 3,
      counts: [
        { optionId: "a1", label: "Red", count: 2 },
        { optionId: "b2", label: "Blue", count: 1 },
      ],
    });
  });

  it("returns zeros for a question with no responses", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner, { type: "nps" });
    as(owner);
    const { status, body } = await questionStats(String(q._id));
    expect(status).toBe(200);
    expect(body.totals).toEqual({ responses: 0, withComment: 0, commentRate: 0 });
    expect(body.average).toBeNull();
    expect(body.nps).toEqual({
      score: null,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
      promoterPct: 0,
      detractorPct: 0,
    });
    expect(body.distribution.counts.every((c: { count: number }) => c.count === 0)).toBe(true);
    expect(body.volume.length).toBeGreaterThan(0);
    expect(body.tags).toEqual([]);
    expect(body.cap).toEqual({ responseCount: 0, maxResponses: null, progress: null });
    expect(JSON.stringify(body)).not.toMatch(/NaN/);
  });

  it("never returns toxicity/pii keys", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner);
    await msg(org._id, owner, {
      questionId: q._id,
      ai: { status: "done", sentiment: "mixed", tags: ["safety"], toxicity: 0.9, pii: 0.8, piiFlag: true },
    });
    as(owner);
    const { body } = await questionStats(String(q._id));
    expect(body.sentiment.totals.mixed).toBe(1);
    expect(body.distribution).toEqual({ kind: "text" });
    expect(allKeys(body).filter((k) => /toxic|pii/i.test(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/toxic|pii/i);
  });

  it("429s past the per-user limit", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeQuestion(org._id, owner);
    for (let i = 0; i < ANALYTICS_RATE_LIMIT.limit; i++) {
      await checkRateLimit(analyticsRateKey(String(owner)), ANALYTICS_RATE_LIMIT.limit, ANALYTICS_RATE_LIMIT.windowMs);
    }
    as(owner);
    expect((await questionStats(String(q._id))).status).toBe(429);
  });
});
