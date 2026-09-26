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
import { GET as listQuestions, POST as createQuestion } from "@/app/api/questions/route";
import {
  PUT as updateQuestion,
  PATCH as patchQuestion,
  GET as getQuestion,
} from "@/app/api/questions/[questionId]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import { localYmd } from "@/lib/zonedDate";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;

async function setOrgPlan(plan: "FREE" | "PRO" | "ENTERPRISE") {
  await OrganizationModel.updateOne({ _id: orgId }, { $set: { plan } });
}

beforeEach(async () => {
  owner = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: "acme",
    createdBy: owner,
    plan: "PRO",
  });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create({ organizationId: orgId, userId: owner, role: "OWNER" });
  getServerSession.mockResolvedValue({ user: { _id: String(owner), activeOrgId: String(orgId) } });
});

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

async function create(body: Record<string, unknown>) {
  const res = await createQuestion(
    req("http://localhost/api/questions", "POST", { questionText: "How was the offsite?", ...body })
  );
  return { status: res.status, json: await res.json() };
}

async function put(id: string, body: unknown) {
  const res = await updateQuestion(req(`http://localhost/api/questions/${id}`, "PUT", body), {
    params: Promise.resolve({ questionId: id }),
  });
  return { status: res.status, json: await res.json() };
}

async function patch(id: string, body: unknown) {
  const res = await patchQuestion(req(`http://localhost/api/questions/${id}`, "PATCH", body), {
    params: Promise.resolve({ questionId: id }),
  });
  return { status: res.status, json: await res.json() };
}

async function get(id: string) {
  const res = await getQuestion(req(`http://localhost/api/questions/${id}`, "GET"), {
    params: Promise.resolve({ questionId: id }),
  });
  return { status: res.status, json: await res.json() };
}

const todayUtc = () => localYmd(new Date(), "UTC");
const validPulse = (overrides: Record<string, unknown> = {}) => ({
  cadence: "weekly",
  anchorDate: todayUtc(),
  timeZone: "UTC",
  ...overrides,
});

describe("create: pulse gating", () => {
  it("PRO + OWNER can create a pulse question", async () => {
    const { status, json } = await create({ pulse: validPulse() });
    expect(status).toBe(201);
    expect(json.question.pulse).toMatchObject({
      cadence: "weekly",
      anchorDate: todayUtc(),
      timeZone: "UTC",
      remind: true,
      round: 0,
    });
    const stored = await QuestionModel.findById(json.question._id).lean();
    expect(stored?.pulse).toMatchObject({ lastRemindedRound: -1, remind: true });
  });

  it("FREE plan: 403 PLAN_UPGRADE_REQUIRED", async () => {
    await setOrgPlan("FREE");
    const { status, json } = await create({ pulse: validPulse() });
    expect(status).toBe(403);
    expect(json.code).toBe("PLAN_UPGRADE_REQUIRED");
    expect(await QuestionModel.countDocuments({})).toBe(0);
  });

  it("MEMBER: 403 even though MEMBER can create ordinary questions", async () => {
    const member = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: orgId, userId: member, role: "MEMBER" });
    getServerSession.mockResolvedValue({ user: { _id: String(member), activeOrgId: String(orgId) } });
    const { status } = await create({ pulse: validPulse() });
    expect(status).toBe(403);
    // Sanity: the same MEMBER can create a plain question.
    getServerSession.mockResolvedValue({ user: { _id: String(member), activeOrgId: String(orgId) } });
    const plain = await create({});
    expect(plain.status).toBe(201);
  });

  it("pulse + maxResponses: 400", async () => {
    const { status } = await create({ pulse: validPulse(), maxResponses: 50 });
    expect(status).toBe(400);
  });

  it("pulse + visibility internal: 400", async () => {
    const { status } = await create({ pulse: validPulse(), visibility: "internal" });
    expect(status).toBe(400);
  });

  it("anchor date in the past: 400", async () => {
    const { status } = await create({ pulse: validPulse({ anchorDate: "2020-01-01" }) });
    expect(status).toBe(400);
  });

  it("invalid time zone: 400", async () => {
    const { status } = await create({ pulse: validPulse({ timeZone: "Not/AZone" }) });
    expect(status).toBe(400);
  });

  it("invalid cadence: 400 (schema rejects it)", async () => {
    const { status } = await create({ pulse: validPulse({ cadence: "daily" }) });
    expect(status).toBe(400);
  });
});

describe("GET/list expose pulse round state", () => {
  it("list and single-question GET both compute round + nextRoundStartsAt", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;

    const list = await (await listQuestions(req("http://localhost/api/questions", "GET"))).json();
    expect(list.questions[0].pulse).toMatchObject({ round: 0, cadence: "weekly" });
    expect(typeof list.questions[0].pulse.nextRoundStartsAt).toBe("string");

    const single = await get(id);
    expect(single.json.question.pulse).toMatchObject({ round: 0, cadence: "weekly" });
  });
});

describe("update: permission, plan gate and validation", () => {
  it("editing an existing pulse still needs question:pulse + the plan gate", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;

    await setOrgPlan("FREE");
    const res = await put(id, { pulse: { remind: false } });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("PLAN_UPGRADE_REQUIRED");
  });

  it("toggling just `remind` doesn't require resending cadence/anchor/timezone", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    const res = await put(id, { pulse: { remind: false } });
    expect(res.status).toBe(200);
    expect(res.json.question.pulse).toMatchObject({
      cadence: "weekly",
      anchorDate: todayUtc(),
      timeZone: "UTC",
      remind: false,
    });
  });

  it("adding maxResponses to an existing pulse question: 400", async () => {
    const { json } = await create({ pulse: validPulse() });
    const res = await put(json.question._id, { maxResponses: 10 });
    expect(res.status).toBe(400);
  });

  it("adding a pulse to an internal question: 400", async () => {
    const { json } = await create({ visibility: "internal" });
    const res = await put(json.question._id, { pulse: validPulse() });
    expect(res.status).toBe(400);
  });

  it("adding a pulse to a question that already has responses: 409 PULSE_LOCKED", async () => {
    const { json } = await create({});
    await QuestionModel.updateOne({ _id: json.question._id }, { $inc: { responseCount: 1 } });
    const res = await put(json.question._id, { pulse: validPulse() });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("PULSE_LOCKED");
  });

  it("changing cadence/anchor/timezone after the first response: 409 PULSE_LOCKED", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await QuestionModel.updateOne({ _id: id }, { $inc: { responseCount: 1 } });

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await put(id, { pulse: { cadence: "monthly" } })).status).toBe(409);
    expect((await put(id, { pulse: { anchorDate: tomorrow } })).status).toBe(409);
    // But remind alone is still fine post-lock.
    const remindOnly = await put(id, { pulse: { remind: false } });
    expect(remindOnly.status).toBe(200);
  });

  it("changing cadence before any response resets the reminder claim", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await QuestionModel.updateOne(
      { _id: id },
      { $set: { "pulse.lastRemindedRound": 3, "pulse.lastRemindedAt": new Date() } }
    );
    const res = await put(id, { pulse: { cadence: "monthly" } });
    expect(res.status).toBe(200);
    const stored = await QuestionModel.findById(id).lean();
    expect(stored?.pulse?.lastRemindedRound).toBe(-1);
    expect(stored?.pulse?.lastRemindedAt).toBeUndefined();
  });

  it("MEMBER can't touch pulse even via question:update-gated PUT", async () => {
    const { json } = await create({ pulse: validPulse() });
    const member = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: orgId, userId: member, role: "MEMBER" });
    getServerSession.mockResolvedValue({ user: { _id: String(member), activeOrgId: String(orgId) } });
    const res = await put(json.question._id, { pulse: { remind: false } });
    // MEMBER doesn't hold question:update at all, so loadAndAuthorize itself
    // refuses before pulse-specific logic ever runs.
    expect(res.status).toBe(403);
  });
});

describe("update: atomic pulse ⟂ maxResponses exclusivity", () => {
  it("racing PUT {pulse} and PUT {maxResponses} on a fresh question: exactly one wins", async () => {
    const { json } = await create({});
    const id = json.question._id;

    const [a, b] = await Promise.all([
      put(id, { pulse: validPulse() }),
      put(id, { maxResponses: 10 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.json.code).toBe("QUESTION_CONFLICT");

    const stored = await QuestionModel.findById(id).lean();
    const hasPulse = Boolean(stored?.pulse);
    const hasCap = stored?.maxResponses != null;
    // Never both, and — since exactly one request won — never neither.
    expect(hasPulse && hasCap).toBe(false);
    expect(hasPulse || hasCap).toBe(true);
  });
});

describe("update: removing a pulse (pulse: null)", () => {
  it("removes the pulse via $unset, no plan gate, even on a FREE org", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await setOrgPlan("FREE");

    const res = await put(id, { pulse: null });
    expect(res.status).toBe(200);
    expect(res.json.question.pulse).toBeFalsy();
    const stored = await QuestionModel.findById(id).lean();
    expect(stored?.pulse).toBeUndefined();
  });

  it("allowed even after the question already has responses (not structurally locked)", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await QuestionModel.updateOne({ _id: id }, { $inc: { responseCount: 1 } });

    const res = await put(id, { pulse: null });
    expect(res.status).toBe(200);
    const stored = await QuestionModel.findById(id).lean();
    expect(stored?.pulse).toBeUndefined();
    expect(stored?.responseCount).toBe(1);
  });

  it("past Message.round stamps are untouched by removal", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await MessageModel.create({
      content: "Thanks",
      createdFor: owner,
      questionId: id,
      organizationId: orgId,
      round: 0,
    });
    await put(id, { pulse: null });
    const stored = await MessageModel.findOne({ questionId: id }).lean<{ round?: number }>();
    expect(stored?.round).toBe(0);
  });

  it("re-adding a pulse after removal + responses exist: 409 PULSE_LOCKED", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await QuestionModel.updateOne({ _id: id }, { $inc: { responseCount: 1 } });
    await put(id, { pulse: null });

    const res = await put(id, { pulse: validPulse() });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("PULSE_LOCKED");
  });

  it("MEMBER can't remove a pulse (no question:pulse permission)", async () => {
    const { json } = await create({ pulse: validPulse() });
    const member = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: orgId, userId: member, role: "MEMBER" });
    getServerSession.mockResolvedValue({ user: { _id: String(member), activeOrgId: String(orgId) } });
    const res = await put(json.question._id, { pulse: null });
    expect(res.status).toBe(403);
  });

  it("removing a pulse that doesn't exist is a no-op 200", async () => {
    const { json } = await create({});
    const res = await put(json.question._id, { pulse: null });
    expect(res.status).toBe(200);
    expect(res.json.question.pulse).toBeFalsy();
  });
});

describe("PATCH isActive: plan-gated reactivation", () => {
  it("deactivating a pulse question always works, regardless of plan", async () => {
    const { json } = await create({ pulse: validPulse() });
    await setOrgPlan("FREE");
    const res = await patch(json.question._id, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.json.question.isActive).toBe(false);
  });

  it("reactivating a pulse question on a downgraded org: 403", async () => {
    const { json } = await create({ pulse: validPulse() });
    await patch(json.question._id, { isActive: false });
    await setOrgPlan("FREE");
    const res = await patch(json.question._id, { isActive: true });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("PLAN_UPGRADE_REQUIRED");
  });

  it("reactivating on a still-PRO org works", async () => {
    const { json } = await create({ pulse: validPulse() });
    await patch(json.question._id, { isActive: false });
    const res = await patch(json.question._id, { isActive: true });
    expect(res.status).toBe(200);
    expect(res.json.question.isActive).toBe(true);
  });

  it("activating a non-pulse question is never plan-gated", async () => {
    const { json } = await create({});
    await setOrgPlan("FREE");
    await patch(json.question._id, { isActive: false });
    const res = await patch(json.question._id, { isActive: true });
    expect(res.status).toBe(200);
  });
});

describe("downgrade keeps existing pulse data intact", () => {
  it("an existing active pulse question keeps its config and responseCount after downgrade", async () => {
    const { json } = await create({ pulse: validPulse() });
    const id = json.question._id;
    await MessageModel.create({
      content: "Thanks for asking",
      createdFor: owner,
      questionId: id,
      organizationId: orgId,
      round: 0,
    });
    await QuestionModel.updateOne({ _id: id }, { $inc: { responseCount: 1 } });
    await setOrgPlan("FREE");
    const stored = await QuestionModel.findById(id).lean();
    expect(stored?.pulse).toBeTruthy();
    expect(stored?.responseCount).toBe(1);
    expect(stored?.isActive).toBe(true);
  });
});
