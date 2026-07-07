import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET } from "@/app/api/messages/export/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/messages/export${query}`);
}

describe("GET /api/messages/export — general (no questionId)", () => {
  it("401s with no session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(req(""));
    expect(res.status).toBe(401);
  });

  it("returns a CSV attachment of the org's general messages", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "OWNER",
    });
    await MessageModel.create({
      content: "Loved the demo",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req(""));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain(
      "messages-acme-"
    );

    const body = await res.text();
    const lines = body.split("\n");
    expect(lines[0]).toBe("Content,Submitted At,Reply,Replied At");
    expect(lines[1]).toContain("Loved the demo");
  });

  it("excludes messages belonging to a question", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "OWNER",
    });
    const question = await QuestionModel.create({
      questionText: "How was onboarding?",
      userId,
      organizationId: org._id,
      slug: "how-was-onboarding",
    });
    await MessageModel.create({
      content: "General feedback",
      createdFor: userId,
      organizationId: org._id,
      questionId: null,
    });
    await MessageModel.create({
      content: "Onboarding was smooth",
      createdFor: userId,
      organizationId: org._id,
      questionId: question._id,
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req(""));
    const body = await res.text();
    expect(body).toContain("General feedback");
    expect(body).not.toContain("Onboarding was smooth");
  });
});

describe("GET /api/messages/export?questionId=...", () => {
  it("404s for a question that doesn't exist", async () => {
    getServerSession.mockResolvedValue({
      user: { _id: String(new mongoose.Types.ObjectId()) },
    });
    const res = await GET(req(`?questionId=${new mongoose.Types.ObjectId()}`));
    expect(res.status).toBe(404);
  });

  it("404s when the caller has no access to the question's organization", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: ownerId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId: ownerId,
      role: "OWNER",
    });
    const question = await QuestionModel.create({
      questionText: "How was onboarding?",
      userId: ownerId,
      organizationId: org._id,
      slug: "how-was-onboarding",
    });

    const outsiderId = new mongoose.Types.ObjectId();
    getServerSession.mockResolvedValue({ user: { _id: String(outsiderId) } });

    const res = await GET(req(`?questionId=${question._id}`));
    expect(res.status).toBe(404);
  });

  it("returns a CSV of the question's public responses, excluding member threads", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "OWNER",
    });
    const question = await QuestionModel.create({
      questionText: "How was onboarding?",
      userId,
      organizationId: org._id,
      slug: "how-was-onboarding",
    });
    await MessageModel.create({
      content: "Onboarding was smooth",
      createdFor: userId,
      organizationId: org._id,
      questionId: question._id,
    });
    await MessageModel.create({
      content: "Private member thread",
      createdFor: userId,
      organizationId: org._id,
      questionId: question._id,
      authorType: "member",
      authorUserId: userId,
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const res = await GET(req(`?questionId=${question._id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain(
      "messages-how-was-onboarding-"
    );

    const body = await res.text();
    expect(body).toContain("Onboarding was smooth");
    expect(body).not.toContain("Private member thread");
  });
});
