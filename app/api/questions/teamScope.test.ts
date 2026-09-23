import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
// The answer route pulls in lib/notifications → lib/mailService, whose
// `new Resend()` throws at import time without RESEND_API_KEY.
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import { GET as exportMessages } from "@/app/api/messages/export/route";
import { GET as getOwnThread } from "@/app/api/questions/[questionId]/answer/route";
import { POST as createQuestion } from "@/app/api/questions/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

// One org: an OWNER, a MEMBER on the "Eng" team, and a MEMBER who isn't.
let orgId: mongoose.Types.ObjectId;
let owner: mongoose.Types.ObjectId;
let onTeam: mongoose.Types.ObjectId;
let offTeam: mongoose.Types.ObjectId;
let teamId: mongoose.Types.ObjectId;
let publicQ: mongoose.Types.ObjectId;
let internalQ: mongoose.Types.ObjectId;

beforeEach(async () => {
  owner = new mongoose.Types.ObjectId();
  onTeam = new mongoose.Types.ObjectId();
  offTeam = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: owner });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create([
    { organizationId: orgId, userId: owner, role: "OWNER" },
    { organizationId: orgId, userId: onTeam, role: "MEMBER" },
    { organizationId: orgId, userId: offTeam, role: "MEMBER" },
  ]);
  const team = await TeamModel.create({
    organizationId: orgId,
    name: "Eng",
    slug: "eng",
    createdBy: owner,
    members: [onTeam],
  });
  teamId = team._id as unknown as mongoose.Types.ObjectId;
  const pq = await QuestionModel.create({
    questionText: "Eng retro?",
    userId: owner,
    organizationId: orgId,
    teamId,
    slug: "eng-retro",
  });
  publicQ = pq._id as unknown as mongoose.Types.ObjectId;
  await MessageModel.create({
    content: "Standups drift",
    createdFor: owner,
    organizationId: orgId,
    questionId: publicQ,
    teamId,
  });
  const iq = await QuestionModel.create({
    questionText: "Eng internal?",
    userId: owner,
    organizationId: orgId,
    teamId,
    slug: "eng-internal",
    visibility: "internal",
  });
  internalQ = iq._id as unknown as mongoose.Types.ObjectId;
});

function as(userId: mongoose.Types.ObjectId) {
  getServerSession.mockResolvedValue({
    user: { _id: String(userId), activeOrgId: String(orgId) },
  });
}
const params = (questionId: mongoose.Types.ObjectId) => ({
  params: Promise.resolve({ questionId: String(questionId) }),
});

describe("GET /api/questions/:id — team scope", () => {
  const call = (id: mongoose.Types.ObjectId) =>
    getQuestion(new NextRequest(`http://localhost/api/questions/${id}`), params(id));

  it("404s a MEMBER who isn't on the question's team", async () => {
    as(offTeam);
    expect((await call(publicQ)).status).toBe(404);
  });

  it("returns the question to a MEMBER on the team, and to the OWNER", async () => {
    for (const user of [onTeam, owner]) {
      as(user);
      const res = await call(publicQ);
      expect(res.status).toBe(200);
      expect((await res.json()).messages).toHaveLength(1);
    }
  });
});

describe("GET /api/messages/export?questionId= — team scope", () => {
  const call = (id: mongoose.Types.ObjectId) =>
    exportMessages(new NextRequest(`http://localhost/api/messages/export?questionId=${id}`));

  it("404s a MEMBER who isn't on the team instead of handing them the CSV", async () => {
    as(offTeam);
    const res = await call(publicQ);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Standups drift");
  });

  it("still exports for a MEMBER on the team", async () => {
    as(onTeam);
    const res = await call(publicQ);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Standups drift");
  });
});

describe("GET /api/questions/:id/answer — team scope and visibility", () => {
  const call = (id: mongoose.Types.ObjectId) =>
    getOwnThread(new NextRequest(`http://localhost/api/questions/${id}/answer`), params(id));

  it("404s a MEMBER who isn't on the internal question's team", async () => {
    as(offTeam);
    expect((await call(internalQ)).status).toBe(404);
  });

  it("works for a MEMBER on the team", async () => {
    as(onTeam);
    const res = await call(internalQ);
    expect(res.status).toBe(200);
    expect((await res.json()).question.questionText).toBe("Eng internal?");
  });

  it("404s for a public question (there are no member threads on those)", async () => {
    as(onTeam);
    expect((await call(publicQ)).status).toBe(404);
  });
});

describe("POST /api/questions — team scope on create", () => {
  const call = (body: Record<string, unknown>) =>
    createQuestion(
      new NextRequest("http://localhost/api/questions", {
        method: "POST",
        body: JSON.stringify({ questionText: "New question?", ...body }),
      })
    );

  it("rejects a MEMBER scoping a question to a team they're not on", async () => {
    as(offTeam);
    const res = await call({ teamId: String(teamId) });
    expect(res.status).toBe(400);
    expect(await QuestionModel.countDocuments({ questionText: "New question?" })).toBe(0);
  });

  it("lets a MEMBER use their own team, and the OWNER use any team", async () => {
    for (const user of [onTeam, owner]) {
      as(user);
      expect((await call({ teamId: String(teamId) })).status).toBe(201);
    }
  });

  it("400s a malformed teamId instead of 500ing", async () => {
    as(owner);
    expect((await call({ teamId: "not-an-id" })).status).toBe(400);
  });
});
