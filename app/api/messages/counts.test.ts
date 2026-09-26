import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  jsonReq,
  msg,
  seedTriageWorld,
  sessionFor,
  JOINED,
  type TriageWorld,
} from "@/test-utils/triageFixture";
import { GET as counts } from "@/app/api/messages/counts/route";
import { GET as getMessages } from "@/app/api/getMessages/route";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import MessageModel from "@/models/message.model";

type Id = mongoose.Types.ObjectId;

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let w: TriageWorld;
beforeEach(async () => {
  w = await seedTriageWorld();
});
const as = (u: Id) => sessionFor(getServerSession, u);
const DAY = 86_400_000;

async function seed() {
  const before = new Date(JOINED.getTime() - DAY); // pre-join ⇒ read for all
  const after = new Date(JOINED.getTime() + DAY);
  for (const [questionId, teamLabel] of [
    [null, "g"],
    [w.qOrg, "o"],
    [w.qA, "a"],
    [w.qB, "b"],
  ] as const) {
    const q = questionId ? { questionId } : {};
    await msg(w, `${teamLabel}-unread`, { ...q, createdAt: after });
    await msg(w, `${teamLabel}-unread2`, { ...q, createdAt: after, assignedTo: w.memberA });
    await msg(w, `${teamLabel}-readA`, { ...q, createdAt: after, readBy: [w.memberA, w.owner] });
    await msg(w, `${teamLabel}-old`, { ...q, createdAt: before });
    await msg(w, `${teamLabel}-oldFollowedUp`, { ...q, createdAt: before, lastInboundAt: after });
    await msg(w, `${teamLabel}-oldReplied`, { ...q, createdAt: before, lastActivityAt: after });
    await msg(w, `${teamLabel}-archived`, { ...q, createdAt: after, archivedAt: after, assignedTo: w.memberA });
  }
  await msg(w, "thread", {
    questionId: w.qInternal,
    authorType: "member",
    authorUserId: w.memberA,
    createdAt: after,
  });
  await MessageModel.create({ content: "foreign", createdFor: w.outsider, organizationId: w.other });
}

async function unreadListLength(questionId: Id | null) {
  const res = questionId
    ? await getQuestion(jsonReq(`/api/questions/${questionId}?unread=1&limit=100`, "GET"), {
        params: Promise.resolve({ questionId: String(questionId) }),
      })
    : await getMessages(jsonReq("/api/getMessages?unread=1&limit=100", "GET"));
  if (res.status !== 200) return 0;
  return (await res.json()).messages.length;
}

describe("GET /api/messages/counts", () => {
  it("401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await counts()).status).toBe(401);
  });

  it("MEMBER on team A: own-team + org-level only; matches the unread lists", async () => {
    await seed();
    as(w.memberA);
    const body = await (await counts()).json();
    // unread, unread2, oldFollowedUp (readA read, old/oldReplied pre-join, archived hidden)
    expect(body).toEqual({
      success: true,
      general: { unread: 3 },
      questions: { [String(w.qOrg)]: 3, [String(w.qA)]: 3 },
      // unread2 in g, o, a (b is another team's; archived ones excluded)
      assignedToMe: 3,
    });
    expect(await unreadListLength(null)).toBe(body.general.unread);
    for (const q of [w.qOrg, w.qA, w.qB]) {
      expect(await unreadListLength(q)).toBe(body.questions[String(q)] ?? 0);
    }
  });

  it("OWNER: every team; matches the unread lists", async () => {
    await seed();
    as(w.owner);
    const body = await (await counts()).json();
    // Owner joined at JOINED too; readA includes owner ⇒ same 3 per list.
    expect(body.general.unread).toBe(3);
    expect(body.questions).toEqual({
      [String(w.qOrg)]: 3,
      [String(w.qA)]: 3,
      [String(w.qB)]: 3,
    });
    expect(body.assignedToMe).toBe(0);
    expect(JSON.stringify(body)).not.toContain(String(w.qInternal));
    expect(await unreadListLength(null)).toBe(body.general.unread);
    for (const q of [w.qOrg, w.qA, w.qB]) {
      expect(await unreadListLength(q)).toBe(body.questions[String(q)]);
    }
  });

  it("empty org → zeros", async () => {
    as(w.admin);
    expect(await (await counts()).json()).toEqual({
      success: true,
      general: { unread: 0 },
      questions: {},
      assignedToMe: 0,
    });
  });
});
