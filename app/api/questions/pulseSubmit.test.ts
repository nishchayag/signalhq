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

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as getSubmit, POST as postSubmit } from "@/app/api/questions/submit/[slug]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;
let ipSeq = 0;

beforeEach(async () => {
  const user = await UserModel.create({
    name: "Owner",
    username: "owner1",
    email: "owner1@example.com",
    password: "x".repeat(20),
    isVerified: true,
  });
  owner = user._id as unknown as mongoose.Types.ObjectId;
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: "acme",
    createdBy: owner,
    plan: "PRO",
  });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create({ organizationId: orgId, userId: owner, role: "OWNER" });
});

function req(url: string, method: string, body?: unknown) {
  ipSeq++;
  return new NextRequest(url, {
    method,
    headers: { "x-forwarded-for": `10.0.${Math.floor(ipSeq / 250)}.${ipSeq % 250}` },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function makeQuestion(slug: string, pulse: Record<string, unknown>) {
  return QuestionModel.create({
    questionText: "How was the offsite?",
    userId: owner,
    organizationId: orgId,
    slug,
    pulse: { remind: true, lastRemindedRound: -1, ...pulse },
  });
}

async function get(slug: string) {
  const res = await getSubmit(req(`http://localhost/api/questions/submit/${slug}`, "GET"), {
    params: Promise.resolve({ slug }),
  });
  return { status: res.status, json: await res.json() };
}

async function post(slug: string, body: unknown) {
  const res = await postSubmit(req(`http://localhost/api/questions/submit/${slug}`, "POST", body), {
    params: Promise.resolve({ slug }),
  });
  return { status: res.status, json: await res.json() };
}

describe("a scheduled pulse (anchor in the future)", () => {
  it("GET reports closed:scheduled with opensAt, POST returns 410", async () => {
    const anchor = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await makeQuestion("future-pulse", { cadence: "weekly", anchorDate: anchor, timeZone: "UTC" });

    const g = await get("future-pulse");
    expect(g.status).toBe(200);
    expect(g.json.question.closed).toMatchObject({ reason: "scheduled" });
    expect(g.json.question.closed.opensAt).toBe(`${anchor}T00:00:00.000Z`);
    expect(g.json.question.pulse).toMatchObject({ cadence: "weekly" });

    const p = await post("future-pulse", { content: "Too early" });
    expect(p.status).toBe(410);
    expect(p.json.code).toBe("QUESTION_CLOSED");
    expect(await MessageModel.countDocuments({})).toBe(0);
  });
});

describe("an open pulse", () => {
  it("GET reports not closed and includes nextRoundStartsAt", async () => {
    await makeQuestion("open-pulse", { cadence: "weekly", anchorDate: "2020-01-01", timeZone: "UTC" });
    const g = await get("open-pulse");
    expect(g.status).toBe(200);
    expect(g.json.question.closed).toBeNull();
    expect(g.json.question.pulse.cadence).toBe("weekly");
    expect(typeof g.json.question.pulse.nextRoundStartsAt).toBe("string");
  });

  it("POST stamps the message with the current round index", async () => {
    // Anchor exactly 3 weeks before "now" (approximately) — round should be 3.
    const anchor = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
    await makeQuestion("stamp-pulse", { cadence: "weekly", anchorDate: anchor, timeZone: "UTC" });

    const p = await post("stamp-pulse", { content: "All good" });
    expect(p.status).toBe(201);
    const stored = await MessageModel.findOne({}).lean<{ round?: number }>();
    expect(stored?.round).toBe(3);
  });

  it("two submits a week apart land in consecutive rounds", async () => {
    const anchor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // yesterday
    const q = await makeQuestion("consecutive", { cadence: "weekly", anchorDate: anchor, timeZone: "UTC" });

    await post("consecutive", { content: "Round A" });
    // Fast-forward the question's own anchor back another 7 days to simulate
    // "one week later" without needing fake timers — the round index only
    // depends on the anchor/now gap.
    await QuestionModel.updateOne(
      { _id: q._id },
      { $set: { "pulse.anchorDate": new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10) } }
    );
    await post("consecutive", { content: "Round B" });

    const msgs = await MessageModel.find({}).sort({ createdAt: 1 }).lean<{ round?: number }[]>();
    expect(msgs).toHaveLength(2);
    expect(msgs[1].round).toBeGreaterThan(msgs[0].round as number);
  });

  it("a non-pulse question's messages get no round field at all", async () => {
    await QuestionModel.create({
      questionText: "How was the offsite?",
      userId: owner,
      organizationId: orgId,
      slug: "no-pulse",
    });
    await post("no-pulse", { content: "Fine" });
    const stored = await MessageModel.findOne({}).lean<{ round?: number }>();
    expect(stored?.round).toBeUndefined();
  });
});
