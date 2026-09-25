import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET } from "@/app/api/questions/[questionId]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import TeamModel from "@/models/team.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

function req(questionId: string, query: string): NextRequest {
  return new NextRequest(`http://localhost/api/questions/${questionId}${query}`);
}

function get(questionId: string, query: string) {
  return GET(req(questionId, query), { params: Promise.resolve({ questionId }) });
}

/** Owner + org + a team-scoped question, with two tagged/sentiment-scored
 * responses on it. */
async function makeScopedQuestion() {
  const ownerId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: "acme",
    createdBy: ownerId,
  });
  await MembershipModel.create({ organizationId: org._id, userId: ownerId, role: "OWNER" });

  const team = await TeamModel.create({
    organizationId: org._id,
    name: "Support",
    slug: "support",
    createdBy: ownerId,
  });

  const question = await QuestionModel.create({
    questionText: "How was your week?",
    userId: ownerId,
    organizationId: org._id,
    teamId: team._id,
    slug: "how-was-your-week",
  });

  await MessageModel.create({
    content: "Buried in tickets this week",
    createdFor: ownerId,
    organizationId: org._id,
    questionId: question._id,
    teamId: team._id,
    ai: { status: "done", attempts: 1, sentiment: "negative", tags: ["workload"] },
  });
  await MessageModel.create({
    content: "Great collaboration this week",
    createdFor: ownerId,
    organizationId: org._id,
    questionId: question._id,
    teamId: team._id,
    ai: { status: "done", attempts: 1, sentiment: "positive", tags: ["culture"] },
  });

  return { ownerId, org, team, question };
}

describe("GET /api/questions/[questionId] — tag/sentiment filters", () => {
  it("tag= narrows to that question's tagged responses", async () => {
    const { ownerId, question } = await makeScopedQuestion();
    getServerSession.mockResolvedValue({ user: { _id: String(ownerId) } });

    const res = await get(String(question._id), "?tag=workload");
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Buried in tickets this week");
  });

  it("sentiment= narrows to that question's matching responses", async () => {
    const { ownerId, question } = await makeScopedQuestion();
    getServerSession.mockResolvedValue({ user: { _id: String(ownerId) } });

    const res = await get(String(question._id), "?sentiment=positive");
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Great collaboration this week");
  });

  it("an invalid tag or sentiment yields an empty list, not the whole thread", async () => {
    const { ownerId, question } = await makeScopedQuestion();
    getServerSession.mockResolvedValue({ user: { _id: String(ownerId) } });

    const badTag = await get(String(question._id), "?tag=nope");
    expect((await badTag.json()).messages).toEqual([]);

    const badSentiment = await get(String(question._id), "?sentiment=furious");
    expect((await badSentiment.json()).messages).toEqual([]);
  });

  it("a MEMBER of the question's team gets team-scoped, tag-filtered results", async () => {
    const { org, team, question } = await makeScopedQuestion();
    const memberId = new mongoose.Types.ObjectId();
    await MembershipModel.create({ organizationId: org._id, userId: memberId, role: "MEMBER" });
    team.members.push(memberId);
    await team.save();
    getServerSession.mockResolvedValue({ user: { _id: String(memberId) } });

    const res = await get(String(question._id), "?tag=workload");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Buried in tickets this week");
    // MEMBER view: sentiment + tags only, never toxicity/PII.
    expect(body.messages[0].ai).toEqual({ sentiment: "negative", tags: ["workload"] });
  });

  it("a MEMBER outside the question's team is blocked even with a matching tag filter", async () => {
    const { org, question } = await makeScopedQuestion();
    const outsiderId = new mongoose.Types.ObjectId();
    // A member of the org, but never added to the question's team.
    await MembershipModel.create({ organizationId: org._id, userId: outsiderId, role: "MEMBER" });
    getServerSession.mockResolvedValue({ user: { _id: String(outsiderId) } });

    const res = await get(String(question._id), "?tag=workload");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.messages).toBeUndefined();
  });
});
