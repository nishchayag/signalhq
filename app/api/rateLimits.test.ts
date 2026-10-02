import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { GET as checkUsername } from "@/app/api/auth/checkUsernameUnique/route";
import { POST as createOrg } from "@/app/api/organizations/route";
import { POST as sendOrgMessage } from "@/app/api/o/[orgSlug]/sendMessage/route";
import { POST as submitQuestion } from "@/app/api/questions/submit/[slug]/route";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import RateLimitHitModel from "@/models/rateLimitHit.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

describe("GET /api/auth/checkUsernameUnique", () => {
  it("allows 30 checks a minute per IP, then 429s", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await checkUsername(
        new NextRequest(`http://localhost/api/auth/checkUsernameUnique?username=name${i}x`, {
          headers: { "x-forwarded-for": "10.9.9.9" },
        })
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("matches case-insensitively (usernames are stored lowercase)", async () => {
    await UserModel.create({ name: "Taken", username: "takenname", email: "t@x.com", password: "x" });
    const res = await checkUsername(
      new NextRequest("http://localhost/api/auth/checkUsernameUnique?username=TakenName", {
        headers: { "x-forwarded-for": "10.9.9.10" },
      })
    );
    expect((await res.json()).success).toBe(false);
  });
});

describe("POST /api/organizations", () => {
  it("caps a user at 10 new orgs an hour", async () => {
    getServerSession.mockResolvedValue({ user: { _id: String(new mongoose.Types.ObjectId()) } });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await createOrg(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({ name: `Org number ${i}` }),
        })
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

// Shared NAT IP for the submit-route rate-limit tests below: every request
// carries the same x-forwarded-for, the way a whole office would behind one
// public address.
const NAT_IP = "203.0.113.50";

async function createOrgForSubmit() {
  const owner = await UserModel.create({
    name: "Owner",
    username: `owner${Math.random().toString(36).slice(2, 8)}`,
    email: `owner${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "x".repeat(20),
    isVerified: true,
  });
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: `acme${Math.random().toString(36).slice(2, 8)}`,
    createdBy: owner._id,
  });
  return { owner, org };
}

const sendOrgMessageReq = (orgSlug: string, content: string, ip = NAT_IP) =>
  sendOrgMessage(
    new NextRequest(`http://localhost/api/o/${orgSlug}/sendMessage`, {
      method: "POST",
      body: JSON.stringify({ content }),
      headers: { "x-forwarded-for": ip },
    }),
    { params: Promise.resolve({ orgSlug }) }
  );

const submitQuestionReq = (slug: string, content: string, ip = NAT_IP) =>
  submitQuestion(
    new NextRequest(`http://localhost/api/questions/submit/${slug}`, {
      method: "POST",
      body: JSON.stringify({ content }),
      headers: { "x-forwarded-for": ip },
    }),
    { params: Promise.resolve({ slug }) }
  );

describe("POST /api/o/[orgSlug]/sendMessage rate limits", () => {
  it("allows 5 per (IP, org) in the window, then 429s, without a global per-org cap for other IPs", async () => {
    const { org } = await createOrgForSubmit();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await sendOrgMessageReq(org.slug, `Feedback number ${i}`)).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);

    // A different IP against the same org is unaffected by the first IP's cap.
    const other = await sendOrgMessageReq(org.slug, "From someone else", "203.0.113.99");
    expect(other.status).toBe(201);
  });

  it("caps one IP at 30 total across different orgs (overall), even though no single org hits its own cap", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const { org } = await createOrgForSubmit();
      statuses.push((await sendOrgMessageReq(org.slug, `Feedback ${i}`)).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("never stores the raw IP in a rate-limit document", async () => {
    const { org } = await createOrgForSubmit();
    await sendOrgMessageReq(org.slug, "Hi there");
    const docs = await RateLimitHitModel.find({ key: /orgSendMessage/ }).lean();
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.key).not.toContain(NAT_IP);
    }
  });
});

describe("POST /api/questions/submit/[slug] rate limits", () => {
  async function makeQuestion(owner: mongoose.Types.ObjectId, orgId: mongoose.Types.ObjectId) {
    return QuestionModel.create({
      questionText: "How was it?",
      userId: owner,
      organizationId: orgId,
      slug: `q${Math.random().toString(36).slice(2, 10)}`,
    });
  }

  it("allows one NAT IP to submit to 20 different questions", async () => {
    const { owner, org } = await createOrgForSubmit();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const q = await makeQuestion(owner._id as unknown as mongoose.Types.ObjectId, org._id as unknown as mongoose.Types.ObjectId);
      statuses.push((await submitQuestionReq(q.slug, `Answer ${i}`)).status);
    }
    expect(statuses.every((s) => s === 201)).toBe(true);
  });

  it("429s on the 6th submit to the same question from one IP", async () => {
    const { owner, org } = await createOrgForSubmit();
    const q = await makeQuestion(owner._id as unknown as mongoose.Types.ObjectId, org._id as unknown as mongoose.Types.ObjectId);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await submitQuestionReq(q.slug, `Answer ${i}`)).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("429s on the 31st submit overall from one IP, across 31 different questions", async () => {
    const { owner, org } = await createOrgForSubmit();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const q = await makeQuestion(owner._id as unknown as mongoose.Types.ObjectId, org._id as unknown as mongoose.Types.ObjectId);
      statuses.push((await submitQuestionReq(q.slug, `Answer ${i}`)).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("never stores the raw IP in a rate-limit document", async () => {
    const { owner, org } = await createOrgForSubmit();
    const q = await makeQuestion(owner._id as unknown as mongoose.Types.ObjectId, org._id as unknown as mongoose.Types.ObjectId);
    await submitQuestionReq(q.slug, "Hi there");
    const docs = await RateLimitHitModel.find({ key: /questionSubmit/ }).lean();
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.key).not.toContain(NAT_IP);
    }
  });
});
