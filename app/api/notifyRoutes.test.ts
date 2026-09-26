import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession, sendNotificationEmail } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  sendNotificationEmail: vi.fn(async (opts: unknown) => {
    void opts;
    return true;
  }),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail,
  sendInvitationEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
import { aiMock } from "@/test-utils/aiMock";

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { POST as sendOrgMessage } from "@/app/api/o/[orgSlug]/sendMessage/route";
import { POST as submitAnswer } from "@/app/api/questions/submit/[slug]/route";
import { POST as answerInternal } from "@/app/api/questions/[questionId]/answer/route";
import { POST as followUp } from "@/app/api/r/[replyToken]/route";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  await clearTestDB();
  getServerSession.mockReset();
  sendNotificationEmail.mockReset();
  sendNotificationEmail.mockResolvedValue(true);
});
afterAll(stopTestDB);

let n = 0;
let ipSeq = 0;
let orgId: mongoose.Types.ObjectId;
let owner: { _id: mongoose.Types.ObjectId; email: string };
let admin: { _id: mongoose.Types.ObjectId; email: string };
let internalQ: mongoose.Types.ObjectId;

async function user(pref: string) {
  n++;
  return UserModel.create({
    name: "P",
    username: `notifyroute${n}`,
    email: `notifyroute${n}@example.com`,
    password: "x",
    isVerified: true,
    notificationPreference: pref,
  });
}

beforeEach(async () => {
  aiMock.reset();
  aiMock.disable();
  owner = await user("immediate");
  admin = await user("immediate");
  const org = await OrganizationModel.create({ name: "Acme", slug: `acme-n-${n}`, createdBy: owner._id });
  orgId = org._id as unknown as mongoose.Types.ObjectId;
  await MembershipModel.create({ organizationId: orgId, userId: owner._id, role: "OWNER" });
  await MembershipModel.create({ organizationId: orgId, userId: admin._id, role: "ADMIN" });
  await QuestionModel.create({ questionText: "How?", userId: owner._id, organizationId: orgId, slug: `pub${n}` });
  const iq = await QuestionModel.create({
    questionText: "Internal?", userId: owner._id, organizationId: orgId, slug: `int${n}`, visibility: "internal",
  });
  internalQ = iq._id as unknown as mongoose.Types.ObjectId;
});

const post = (url: string, content: string) =>
  new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({ content }),
    headers: { "x-forwarded-for": `10.9.0.${++ipSeq}` },
  });
const recipients = () =>
  sendNotificationEmail.mock.calls.map((c) => (c[0] as { email: string }).email).sort();

// With `hang` on, every mail send never settles: a route that awaited its
// notifications would never respond.
let hang = false;
async function timed<T>(fn: () => Promise<T>) {
  if (hang) sendNotificationEmail.mockImplementation(() => new Promise<boolean>(() => {}));
  const t0 = Date.now();
  const res = await fn();
  expect(Date.now() - t0).toBeLessThan(2000);
  return res;
}

describe.each([
  { mode: "resolving mail", hanging: false },
  { mode: "hanging mail", hanging: true },
])("message routes notify after responding ($mode)", ({ hanging }) => {
  beforeEach(() => {
    hang = hanging;
  });
  // Sends are sequential, so a hanging send stops at the first recipient.
  const expectRecipients = async (expected: string[]) => {
    if (hanging) {
      await vi.waitFor(() => expect(sendNotificationEmail).toHaveBeenCalledTimes(1));
      expect(expected).toContain(recipients()[0]);
    } else {
      await vi.waitFor(() => expect(recipients()).toEqual([...expected].sort()));
    }
  };

  it("org sendMessage: 201 promptly; emails the owner and every admin", async () => {
    const slug = (await OrganizationModel.findById(orgId))!.slug;
    const res = await timed(() =>
      sendOrgMessage(post(`http://localhost/api/o/${slug}/sendMessage`, "Nice work"), {
        params: Promise.resolve({ orgSlug: slug }),
      })
    );
    expect(res.status).toBe(201);
    await expectRecipients([owner.email, admin.email]);
  });

  it("question submit: 201 promptly; question owner + admins", async () => {
    const slug = `pub${n}`;
    const res = await timed(() =>
      submitAnswer(post(`http://localhost/api/questions/submit/${slug}`, "Nice work"), {
        params: Promise.resolve({ slug }),
      })
    );
    expect(res.status).toBe(201);
    await expectRecipients([owner.email, admin.email]);
  });

  it("internal answer: 200 promptly; the answering admin isn't emailed", async () => {
    getServerSession.mockResolvedValue({ user: { _id: String(admin._id), activeOrgId: String(orgId) } });
    const res = await timed(() =>
      answerInternal(post(`http://localhost/api/questions/${internalQ}/answer`, "My answer"), {
        params: Promise.resolve({ questionId: String(internalQ) }),
      })
    );
    expect(res.status).toBe(200);
    await expectRecipients([owner.email]);
    await new Promise((r) => setTimeout(r, 30));
    expect(recipients()).toEqual([owner.email]);
  });

  it("sender follow-up: 201 promptly; reaches the assignee too", async () => {
    const assignee = await user("immediate");
    await MembershipModel.create({ organizationId: orgId, userId: assignee._id, role: "MEMBER" });
    await MessageModel.create({
      content: "First",
      createdFor: owner._id,
      organizationId: orgId,
      replyToken: `tok_${"y".repeat(30)}`,
      assignedTo: assignee._id,
    });
    const token = `tok_${"y".repeat(30)}`;
    const res = await timed(() =>
      followUp(post(`http://localhost/api/r/${token}`, "Any update?"), {
        params: Promise.resolve({ replyToken: token }),
      })
    );
    expect(res.status).toBe(201);
    await expectRecipients([owner.email, admin.email, assignee.email]);
  });
});
