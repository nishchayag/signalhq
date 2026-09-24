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
import { GET as getMessages } from "@/app/api/getMessages/route";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import { GET as getThread } from "@/app/api/messages/[messageId]/reply/route";
import { GET as getReplies } from "@/app/api/questions/[questionId]/replies/route";
import { GET as getOwnThread } from "@/app/api/questions/[questionId]/answer/route";
import { GET as exportMessages } from "@/app/api/messages/export/route";
import { GET as getReceipt } from "@/app/api/r/[replyToken]/route";
import { RECEIPT_FIELDS } from "@/lib/receipt";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

type Id = mongoose.Types.ObjectId;
let orgId: Id;
let owner: Id;
let member: Id;
let publicQ: Id;
let internalQ: Id;
let threadId: Id;
const TOKEN = `tok_readstate_${"x".repeat(24)}`;

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date(Date.now() - 10 * DAY);

// Messages: old (before member joined), ownerRead (after join, read by
// owner only), fresh (after join, unread by all), oldActive (before join, new
// activity after join).
async function seedMessages(questionId: Id | null) {
  const q = questionId ? { questionId } : {};
  const make = (content: string, at: Date, extra: Record<string, unknown> = {}) =>
    MessageModel.create({
      content, createdFor: owner, organizationId: orgId, createdAt: at, ...q, ...extra,
    });
  const old = await make("old", new Date(t0.getTime() - DAY));
  const ownerRead = await make("ownerRead", new Date(t0.getTime() + DAY), {
    replyToken: questionId ? undefined : TOKEN,
  });
  const fresh = await make("fresh", new Date(t0.getTime() + 2 * DAY));
  const oldActive = await make("oldActive", new Date(t0.getTime() - 2 * DAY), {
    lastActivityAt: new Date(t0.getTime() + 3 * DAY),
  });
  // Written raw, the way triage will ($addToSet), so select:false is what
  // keeps readBy out — not the absence of data.
  await MessageModel.collection.updateOne(
    { _id: ownerRead._id as Id },
    {
      $set: {
        readBy: [owner],
        labels: [new mongoose.Types.ObjectId()],
        assignedTo: member,
        assignedAt: new Date(),
        assignedBy: owner,
        archivedAt: null,
      },
    }
  );
  return { old, ownerRead, fresh, oldActive };
}

beforeEach(async () => {
  const [o, m] = await UserModel.create([
    { name: "Owner", username: "ownerr", email: "o@r.com", password: "x", isVerified: true },
    { name: "Mem", username: "memberr", email: "m@r.com", password: "x", isVerified: true },
  ]);
  owner = o._id as Id;
  member = m._id as Id;
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme-r", createdBy: owner });
  orgId = org._id as unknown as Id;
  // Owner joined long ago; the member joined at t0 (no explicit readSince).
  await MembershipModel.create({ organizationId: orgId, userId: owner, role: "OWNER", createdAt: new Date(t0.getTime() - 30 * DAY) });
  await MembershipModel.create({ organizationId: orgId, userId: member, role: "MEMBER", createdAt: t0 });
  publicQ = (await QuestionModel.create({
    questionText: "Retro?", userId: owner, organizationId: orgId, slug: "retro-r",
  }))._id as unknown as Id;
  internalQ = (await QuestionModel.create({
    questionText: "Internal?", userId: owner, organizationId: orgId, slug: "internal-r", visibility: "internal",
  }))._id as unknown as Id;
  const thread = await MessageModel.create({
    content: "My private answer", createdFor: owner, organizationId: orgId, questionId: internalQ,
    authorType: "member", authorUserId: member,
  });
  threadId = thread._id as Id;
  await MessageModel.collection.updateOne({ _id: threadId }, { $set: { readBy: [owner, member] } });
});

function as(userId: Id) {
  getServerSession.mockResolvedValue({ user: { _id: String(userId), activeOrgId: String(orgId) } });
}
const qp = (questionId: Id) => ({ params: Promise.resolve({ questionId: String(questionId) }) });
const readMap = (body: { messages: { content: string; read: boolean }[] }) =>
  Object.fromEntries(body.messages.map((m) => [m.content, m.read]));

function expectNoReadBy(body: unknown) {
  expect(JSON.stringify(body)).not.toContain("readBy");
}

describe("per-viewer read state on list routes", () => {
  it("getMessages: read per viewer, readSince (membership createdAt) applied", async () => {
    await seedMessages(null);
    as(owner);
    const o = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expectNoReadBy(o);
    expect(readMap(o)).toEqual({ old: false, ownerRead: true, fresh: false, oldActive: false });

    as(member);
    const m = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expectNoReadBy(m);
    // "old" predates the member's join ⇒ read; "oldActive" had activity after.
    expect(readMap(m)).toEqual({ old: true, ownerRead: false, fresh: false, oldActive: false });
  });

  it("an explicit Membership.readSince overrides createdAt", async () => {
    await seedMessages(null);
    await MembershipModel.updateOne(
      { organizationId: orgId, userId: member },
      { readSince: new Date(t0.getTime() + 5 * DAY) }
    );
    as(member);
    const m = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expect(readMap(m)).toEqual({ old: true, ownerRead: true, fresh: true, oldActive: true });
  });

  it("questions/:id GET: same per-viewer read state", async () => {
    await seedMessages(publicQ);
    as(owner);
    const o = await (await getQuestion(new NextRequest(`http://localhost/api/questions/${publicQ}`), qp(publicQ))).json();
    expectNoReadBy(o);
    expect(readMap(o)).toEqual({ old: false, ownerRead: true, fresh: false, oldActive: false });
    as(member);
    const m = await (await getQuestion(new NextRequest(`http://localhost/api/questions/${publicQ}`), qp(publicQ))).json();
    expectNoReadBy(m);
    expect(readMap(m)).toEqual({ old: true, ownerRead: false, fresh: false, oldActive: false });
  });

  it("list routes still return the triage fields themselves", async () => {
    await seedMessages(null);
    as(owner);
    const o = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    const msg = o.messages.find((x: { content: string }) => x.content === "ownerRead");
    expect(msg.assignedTo).toBe(String(member));
    expect(msg.labels).toHaveLength(1);
  });
});

describe("readBy never leaves the server", () => {
  it("thread GET, member-thread list, own-thread GET and CSV export omit it", async () => {
    await seedMessages(null);
    as(owner);
    const thread = await (await getThread(
      new NextRequest(`http://localhost/api/messages/${threadId}/reply`),
      { params: Promise.resolve({ messageId: String(threadId) }) }
    )).json();
    expect(thread.success).toBe(true);
    expectNoReadBy(thread);

    const replies = await (await getReplies(
      new NextRequest(`http://localhost/api/questions/${internalQ}/replies`), qp(internalQ)
    )).json();
    expect(replies.success).toBe(true);
    expectNoReadBy(replies);

    const csv = await (await exportMessages(new NextRequest("http://localhost/api/messages/export"))).text();
    expect(csv).toContain("ownerRead");
    expect(csv).not.toContain(String(owner));

    as(member);
    const own = await (await getOwnThread(
      new NextRequest(`http://localhost/api/questions/${internalQ}/answer`), qp(internalQ)
    )).json();
    expectNoReadBy(own);
  });

  it("the anonymous receipt never carries triage fields", async () => {
    await seedMessages(null);
    const res = await getReceipt(new NextRequest(`http://localhost/api/r/${TOKEN}`), {
      params: Promise.resolve({ replyToken: TOKEN }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    const s = JSON.stringify(body);
    for (const key of ["readBy", "labels", "assignedTo", "assignedAt", "assignedBy", "archivedAt", "archivedBy", "read\""]) {
      expect(s).not.toContain(key);
    }
  });

  it("RECEIPT_FIELDS is an explicit allow-list with no triage field", () => {
    const fields = RECEIPT_FIELDS.split(/\s+/);
    expect(fields.every((f) => !f.startsWith("-") && !f.startsWith("+"))).toBe(true);
    for (const f of ["readBy", "labels", "assignedTo", "assignedAt", "assignedBy", "archivedAt", "archivedBy"]) {
      expect(fields).not.toContain(f);
    }
  });
});
