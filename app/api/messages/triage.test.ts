import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  jsonReq,
  msg,
  raw,
  rawDoc,
  seedTriageWorld,
  sessionFor,
  JOINED,
  type TriageWorld,
} from "@/test-utils/triageFixture";
import { PATCH } from "@/app/api/messages/[messageId]/route";
import {
  GET as getThread,
  POST as postReply,
} from "@/app/api/messages/[messageId]/reply/route";
import { POST as senderFollowUp } from "@/app/api/r/[replyToken]/route";
import { POST as memberAnswer } from "@/app/api/questions/[questionId]/answer/route";
import { GET as getMessages } from "@/app/api/getMessages/route";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import MembershipModel from "@/models/membership.model";
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
const patch = (id: Id | string, body: unknown) =>
  PATCH(jsonReq(`/api/messages/${id}`, "PATCH", body), {
    params: Promise.resolve({ messageId: String(id) }),
  });
const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : v);

describe("PATCH /api/messages/:id — validation and visibility", () => {
  it("401 without a session; 404 for a malformed/unknown id", async () => {
    const m = await msg(w, "hi");
    getServerSession.mockResolvedValue(null);
    expect((await patch(m, { read: true })).status).toBe(401);
    as(w.owner);
    expect((await patch("nope", { read: true })).status).toBe(404);
    expect((await patch(new mongoose.Types.ObjectId(), { read: true })).status).toBe(404);
  });

  it("400 for an empty body, unknown keys, bad types, bad JSON", async () => {
    const m = await msg(w, "hi");
    as(w.owner);
    for (const body of [{}, { nope: 1 }, { read: "yes" }, { assignedTo: "x" }, { labels: {} }]) {
      expect((await patch(m, body)).status).toBe(400);
    }
    expect((await patch(m, "{not json")).status).toBe(400);
  });

  it("another org's message is 404; another team's message is 404 for a MEMBER", async () => {
    const mine = await msg(w, "a", { questionId: w.qA });
    as(w.outsider);
    expect((await patch(mine, { read: true })).status).toBe(404);
    as(w.memberB);
    expect((await patch(mine, { read: true })).status).toBe(404);
    as(w.memberA);
    expect((await patch(mine, { read: true })).status).toBe(200);
  });

  it("readBy is never in the response; read reflects the caller", async () => {
    const m = await msg(w, "hi");
    as(w.memberA);
    const res = await patch(m, { read: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("readBy");
    expect(body.message.read).toBe(true);
  });
});

describe("read / unread (any role with access)", () => {
  it("adds and removes only the caller in readBy", async () => {
    const m = await msg(w, "hi");
    await raw(m, { readBy: [w.owner] });
    as(w.memberA);
    expect((await patch(m, { read: true })).status).toBe(200);
    expect((ids((await rawDoc(m))!.readBy) as string[]).sort()).toEqual(
      [String(w.owner), String(w.memberA)].sort()
    );
    const res = await patch(m, { read: false });
    expect((await res.json()).message.read).toBe(false);
    expect(ids((await rawDoc(m))!.readBy)).toEqual([String(w.owner)]);
  });
});

describe("archive", () => {
  it("OWNER/ADMIN archive and unarchive; archivedBy recorded", async () => {
    const m = await msg(w, "hi");
    as(w.admin);
    const res = await patch(m, { archived: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.archivedAt).toBeTruthy();
    expect(String(body.message.archivedBy)).toBe(String(w.admin));
    expect((await patch(m, { archived: false })).status).toBe(200);
    const doc = (await rawDoc(m))!;
    expect(doc).not.toHaveProperty("archivedAt");
    expect(doc).not.toHaveProperty("archivedBy");
  });

  it("MEMBER → 403, unless they're the assignee → 200", async () => {
    const m = await msg(w, "hi");
    as(w.memberA);
    expect((await patch(m, { archived: true })).status).toBe(403);
    await raw(m, { assignedTo: w.memberA });
    expect((await patch(m, { archived: true })).status).toBe(200);
    expect((await patch(m, { archived: false })).status).toBe(200);
  });

  it("the assignee exception covers archive only, not labels/assign", async () => {
    const m = await msg(w, "hi");
    await raw(m, { assignedTo: w.memberA });
    as(w.memberA);
    expect((await patch(m, { labels: { add: [String(w.labels[0])] } })).status).toBe(403);
    expect((await patch(m, { assignedTo: null })).status).toBe(403);
    expect((await patch(m, { archived: true, assignedTo: null })).status).toBe(403);
  });
});

describe("labels", () => {
  it("MEMBER → 403", async () => {
    const m = await msg(w, "hi");
    as(w.memberA);
    expect((await patch(m, { labels: { add: [String(w.labels[0])] } })).status).toBe(403);
  });

  it("add/remove in one call; an emptied set removes the field", async () => {
    const m = await msg(w, "hi");
    as(w.owner);
    const [a, b] = w.labels.map(String);
    let body = await (await patch(m, { labels: { add: [a, b, a] } })).json();
    expect((ids(body.message.labels) as string[]).sort()).toEqual([a, b].sort());
    body = await (await patch(m, { labels: { add: [String(w.labels[2])], remove: [a] } })).json();
    expect((ids(body.message.labels) as string[]).sort()).toEqual([b, String(w.labels[2])].sort());
    await patch(m, { labels: { remove: [b, String(w.labels[2])] } });
    expect(await rawDoc(m)).not.toHaveProperty("labels");
  });

  it("a label id from another org (or unknown) → 400", async () => {
    const m = await msg(w, "hi");
    as(w.owner);
    expect((await patch(m, { labels: { add: [String(w.foreignLabel)] } })).status).toBe(400);
    expect(
      (await patch(m, { labels: { add: [String(new mongoose.Types.ObjectId())] } })).status
    ).toBe(400);
    expect(await rawDoc(m)).not.toHaveProperty("labels");
  });

  it("more than 5 labels → 400, atomically (nothing written)", async () => {
    const m = await msg(w, "hi");
    as(w.owner);
    const all = w.labels.map(String);
    expect((await patch(m, { labels: { add: all.slice(0, 5) } })).status).toBe(200);
    expect((await patch(m, { labels: { add: [all[5]] } })).status).toBe(400);
    expect(ids((await rawDoc(m))!.labels)).toHaveLength(5);
    // Swapping one out stays within the cap.
    expect((await patch(m, { labels: { add: [all[5]], remove: [all[0]] } })).status).toBe(200);
    // More than 5 in one request is a schema error.
    expect((await patch(m, { labels: { add: all } })).status).toBe(400);
  });
});

describe("assign", () => {
  it("MEMBER → 403", async () => {
    const m = await msg(w, "hi");
    as(w.memberA);
    expect((await patch(m, { assignedTo: String(w.memberA) })).status).toBe(403);
  });

  it("assign sets assignedTo/At/By; null $unsets all three", async () => {
    const m = await msg(w, "a", { questionId: w.qA });
    as(w.owner);
    const body = await (await patch(m, { assignedTo: String(w.memberA) })).json();
    expect(String(body.message.assignedTo)).toBe(String(w.memberA));
    expect(String(body.message.assignedBy)).toBe(String(w.owner));
    expect(body.message.assignedAt).toBeTruthy();
    expect((await patch(m, { assignedTo: null })).status).toBe(200);
    const doc = (await rawDoc(m))!;
    for (const k of ["assignedTo", "assignedAt", "assignedBy"]) expect(doc).not.toHaveProperty(k);
  });

  it("non-member target, or a MEMBER not on the message's team → 400", async () => {
    const m = await msg(w, "a", { questionId: w.qA });
    as(w.owner);
    expect((await patch(m, { assignedTo: String(w.outsider) })).status).toBe(400);
    expect((await patch(m, { assignedTo: String(w.memberB) })).status).toBe(400);
    // ADMIN sees every team.
    expect((await patch(m, { assignedTo: String(w.admin) })).status).toBe(200);
    // Org-level message: any member.
    const g = await msg(w, "general");
    expect((await patch(g, { assignedTo: String(w.memberB) })).status).toBe(200);
  });
});

describe("member private threads: read-only triage", () => {
  let thread: Id;
  beforeEach(async () => {
    thread = await msg(w, "private", {
      questionId: w.qInternal,
      authorType: "member",
      authorUserId: w.memberA,
    });
  });

  it("the author and OWNER/ADMIN may mark read; nothing else", async () => {
    as(w.memberA);
    const own = await (await patch(thread, { read: true })).json();
    expect(own.message.read).toBe(true);
    expect(own.message).not.toHaveProperty("ai");
    as(w.admin);
    expect((await patch(thread, { read: true })).status).toBe(200);
    for (const body of [{ archived: true }, { labels: { add: [String(w.labels[0])] } }, { assignedTo: String(w.admin) }]) {
      expect((await patch(thread, body)).status).toBe(403);
    }
    as(w.memberA);
    expect((await patch(thread, { archived: true })).status).toBe(403);
  });

  it("another MEMBER gets 404", async () => {
    as(w.memberB);
    expect((await patch(thread, { read: true })).status).toBe(404);
  });
});

describe("list filters over real data", () => {
  it("status defaults to open (archived hidden); archived/all; label; assignee", async () => {
    const open = await msg(w, "open");
    const arch = await msg(w, "arch");
    await raw(arch, { archivedAt: new Date(), archivedBy: w.owner });
    const labelled = await msg(w, "labelled", { labels: [w.labels[0]] });
    const mine = await msg(w, "mine", { assignedTo: w.memberA });
    void open; void labelled; void mine;
    as(w.memberA);
    const list = async (qs = "") =>
      ((await (await getMessages(jsonReq(`/api/getMessages${qs}`, "GET"))).json()).messages as {
        content: string;
      }[]).map((m) => m.content).sort();
    expect(await list()).toEqual(["labelled", "mine", "open"]);
    expect(await list("?status=archived")).toEqual(["arch"]);
    expect(await list("?status=all")).toEqual(["arch", "labelled", "mine", "open"]);
    expect(await list(`?label=${w.labels[0]}`)).toEqual(["labelled"]);
    expect(await list("?label=bogus")).toEqual([]);
    expect(await list("?assignee=me")).toEqual(["mine"]);
    expect(await list("?assignee=none")).toEqual(["labelled", "open"]);
    expect(await list(`?assignee=${w.memberA}`)).toEqual(["mine"]);
  });

  it("unread=1 on a question list", async () => {
    const a = await msg(w, "read", { questionId: w.qOrg, readBy: [w.memberA] });
    const b = await msg(w, "unread", { questionId: w.qOrg });
    void a; void b;
    as(w.memberA);
    const res = await getQuestion(jsonReq(`/api/questions/${w.qOrg}?unread=1`, "GET"), {
      params: Promise.resolve({ questionId: String(w.qOrg) }),
    });
    const body = await res.json();
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual(["unread"]);
  });
});

describe("read-state side effects", () => {
  const TOKEN = `tok_triage_${"y".repeat(24)}`;

  it("readSince + lastInboundAt: an org reply keeps a pre-join message read; a sender follow-up makes it unread", async () => {
    // memberA joins now; the message predates it.
    await MembershipModel.updateOne(
      { organizationId: w.org, userId: w.memberA },
      { readSince: new Date() }
    );
    const m = await msg(w, "old", {
      createdAt: new Date(JOINED.getTime() + 1000),
      replyToken: TOKEN,
    });
    const readFor = async () => {
      as(w.memberA);
      const body = await (await getMessages(jsonReq("/api/getMessages", "GET"))).json();
      return body.messages.find((x: { content: string }) => x.content === "old").read;
    };
    expect(await readFor()).toBe(true);

    as(w.owner);
    const rep = await postReply(jsonReq(`/api/messages/${m}/reply`, "POST", { content: "Thanks!" }), {
      params: Promise.resolve({ messageId: String(m) }),
    });
    expect(rep.status).toBe(200);
    expect(await readFor()).toBe(true);
    // …and it marked the replier read.
    expect(ids((await rawDoc(m))!.readBy)).toEqual([String(w.owner)]);

    const fu = await senderFollowUp(jsonReq(`/api/r/${TOKEN}`, "POST", { content: "One more thing" }), {
      params: Promise.resolve({ replyToken: TOKEN }),
    });
    expect(fu.status).toBe(201);
    expect(await readFor()).toBe(false);
  });

  it("a sender follow-up unarchives and clears readBy", async () => {
    const m = await msg(w, "x", { replyToken: TOKEN });
    await raw(m, { readBy: [w.owner, w.admin], archivedAt: new Date(), archivedBy: w.owner });
    const fu = await senderFollowUp(jsonReq(`/api/r/${TOKEN}`, "POST", { content: "Hello again" }), {
      params: Promise.resolve({ replyToken: TOKEN }),
    });
    expect(fu.status).toBe(201);
    const doc = (await rawDoc(m))!;
    for (const k of ["readBy", "archivedAt", "archivedBy"]) expect(doc).not.toHaveProperty(k);
    expect(doc.lastInboundAt).toBeInstanceOf(Date);
  });

  it("a member follow-up in their thread unarchives and clears readBy", async () => {
    const t = await msg(w, "first", {
      questionId: w.qInternal,
      authorType: "member",
      authorUserId: w.memberA,
    });
    await raw(t, { readBy: [w.owner, w.memberA], archivedAt: new Date(), archivedBy: w.owner });
    as(w.memberA);
    const res = await memberAnswer(
      jsonReq(`/api/questions/${w.qInternal}/answer`, "POST", { content: "follow up" }),
      { params: Promise.resolve({ questionId: String(w.qInternal) }) }
    );
    expect(res.status).toBe(200);
    const doc = (await rawDoc(t))!;
    for (const k of ["readBy", "archivedAt", "archivedBy"]) expect(doc).not.toHaveProperty(k);
    expect((doc.replies as unknown[]).length).toBe(1);
    expect(doc.lastInboundAt).toBeInstanceOf(Date);
  });

  it("creation stamps lastInboundAt = createdAt", async () => {
    as(w.memberA);
    await memberAnswer(
      jsonReq(`/api/questions/${w.qInternal}/answer`, "POST", { content: "new thread" }),
      { params: Promise.resolve({ questionId: String(w.qInternal) }) }
    );
    const doc = await MessageModel.findOne({ authorUserId: w.memberA }).lean<{
      createdAt: Date;
      lastInboundAt: Date;
    }>();
    expect(doc!.lastInboundAt.getTime()).toBe(doc!.createdAt.getTime());
  });

  it("opening the thread marks the viewer read and returns read: true", async () => {
    const m = await msg(w, "x");
    as(w.admin);
    const res = await getThread(jsonReq(`/api/messages/${m}/reply`, "GET"), {
      params: Promise.resolve({ messageId: String(m) }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message.read).toBe(true);
    expect(JSON.stringify(body)).not.toContain("readBy");
    expect(ids((await rawDoc(m))!.readBy)).toEqual([String(w.admin)]);
  });
});
