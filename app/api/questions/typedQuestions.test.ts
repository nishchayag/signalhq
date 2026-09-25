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
import { PUT as updateQuestion } from "@/app/api/questions/[questionId]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;

beforeEach(async () => {
  owner = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: owner });
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

describe("create + list projections", () => {
  it("creates a single-choice question with server-generated option ids", async () => {
    const closesAt = new Date(Date.now() + 86_400_000).toISOString();
    const { status, json } = await create({
      type: "single",
      config: { options: [{ label: "Yes" }, { id: "client-made", label: "No" }], maxSelections: 2 },
      closesAt,
      maxResponses: 50,
    });
    expect(status).toBe(201);
    const q = json.question;
    expect(q.type).toBe("single");
    expect(q.config.options).toHaveLength(2);
    expect(q.config.options[1].id).not.toBe("client-made");
    expect(q.config.allowComment).toBe(true);
    // maxSelections only applies to multi.
    expect(q.config.maxSelections).toBeUndefined();
    expect(new Date(q.closesAt).toISOString()).toBe(closesAt);
    expect(q.maxResponses).toBe(50);

    const list = await (await listQuestions(req("http://localhost/api/questions", "GET"))).json();
    expect(list.questions[0]).toMatchObject({ type: "single", maxResponses: 50 });
    expect(list.questions[0].config.options.map((o: { label: string }) => o.label)).toEqual(["Yes", "No"]);
  });

  it("a text question stores no config", async () => {
    const { json } = await create({ config: { allowComment: false } });
    expect(json.question.type).toBe("text");
    const doc = await QuestionModel.collection.findOne({ _id: new mongoose.Types.ObjectId(json.question._id) });
    expect(doc).not.toHaveProperty("config");
  });

  it("400 on an invalid config", async () => {
    const { status } = await create({ type: "multi", config: { options: [{ label: "Only" }] } });
    expect(status).toBe(400);
  });
});

describe("PUT lock", () => {
  async function choiceQuestion() {
    const { json } = await create({
      type: "single",
      config: { options: [{ label: "Yes" }, { label: "No" }] },
    });
    return json.question as { _id: string; config: { options: { id: string; label: string }[] } };
  }

  it("before any answer: type and options can change", async () => {
    const q = await choiceQuestion();
    const r1 = await put(q._id, { config: { options: [{ label: "A" }, { label: "B" }, { label: "C" }] } });
    expect(r1.status).toBe(200);
    expect(r1.json.question.config.options).toHaveLength(3);
    const r2 = await put(q._id, { type: "rating" });
    expect(r2.status).toBe(200);
    expect(r2.json.question.type).toBe("rating");
    expect(r2.json.question.config.options).toBeUndefined();
  });

  it("after the first answer: 409 QUESTION_LOCKED on type or option-id changes", async () => {
    const q = await choiceQuestion();
    await QuestionModel.updateOne({ _id: q._id }, { $inc: { responseCount: 1 } });
    const [yes, no] = q.config.options;

    const typeChange = await put(q._id, { type: "multi" });
    expect(typeChange.status).toBe(409);
    expect(typeChange.json.code).toBe("QUESTION_LOCKED");

    const added = await put(q._id, { config: { options: [yes, no, { label: "Maybe" }] } });
    expect(added.status).toBe(409);

    const removed = await put(q._id, { config: { options: [yes, { label: "Nope" }] } });
    expect(removed.status).toBe(409);

    const stored = await QuestionModel.findById(q._id).lean();
    expect(stored?.type).toBe("single");
    expect(stored?.config?.options?.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("after the first answer: relabel, reorder, text, close date and cap still work", async () => {
    const q = await choiceQuestion();
    await QuestionModel.updateOne({ _id: q._id }, { $inc: { responseCount: 1 } });
    const [yes, no] = q.config.options;
    const res = await put(q._id, {
      questionText: "How was the offsite, really?",
      config: { options: [{ id: no.id, label: "Nah" }, { id: yes.id, label: "Yep" }] },
      maxResponses: 10,
      closesAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.json.question.config.options).toEqual([
      { id: no.id, label: "Nah" },
      { id: yes.id, label: "Yep" },
    ]);
    expect(res.json.question.maxResponses).toBe(10);

    const cleared = await put(q._id, { closesAt: null, maxResponses: null });
    expect(cleared.status).toBe(200);
    expect(cleared.json.question.closesAt).toBeUndefined();
    expect(cleared.json.question.maxResponses).toBeUndefined();
  });

  it("locks on an existing message even when responseCount drifted to 0", async () => {
    const q = await choiceQuestion();
    await MessageModel.create({
      content: "",
      answer: { kind: "single", choices: [q.config.options[0].id], labels: ["Yes"] },
      createdFor: owner,
      questionId: q._id,
      organizationId: orgId,
    });
    expect((await put(q._id, { type: "nps" })).status).toBe(409);
  });

  it("400 when the merged config is invalid", async () => {
    const q = await choiceQuestion();
    expect((await put(q._id, { type: "multi", config: { options: [{ label: "One" }] } })).status).toBe(400);
  });
});

describe("Message content requirement", () => {
  it("content is required without an answer, optional with one", async () => {
    const base = { createdFor: owner, organizationId: orgId };
    await expect(MessageModel.create({ ...base, content: "" })).rejects.toThrow();
    const typed = await MessageModel.create({ ...base, answer: { kind: "rating", score: 3 } });
    expect(typed.content).toBe("");
  });
});
