import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  jsonReq,
  msg,
  raw,
  rawDoc,
  seedTriageWorld,
  sessionFor,
  type TriageWorld,
} from "@/test-utils/triageFixture";
import { POST } from "@/app/api/messages/bulk/route";
import MessageModel from "@/models/message.model";
import RateLimitHitModel from "@/models/rateLimitHit.model";

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
const bulk = (body: unknown) => POST(jsonReq("/api/messages/bulk", "POST", body));
const readers = async (id: Id) => ((await rawDoc(id))!.readBy as Id[] | undefined)?.map(String) ?? [];

describe("POST /api/messages/bulk — ids", () => {
  it("401 without a session; 400 for bad bodies", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await bulk({ ids: [String(w.qOrg)], action: "read" })).status).toBe(401);
    as(w.owner);
    const id = String(new mongoose.Types.ObjectId());
    for (const body of [
      {},
      { ids: [], action: "read" },
      { ids: [id], action: "explode" },
      { ids: ["bad"], action: "read" },
      { ids: Array.from({ length: 101 }, () => id), action: "read" },
      { scope: { general: true }, action: "read" },
      { ids: [id], action: "markAllRead" },
    ]) {
      expect((await bulk(body)).status).toBe(400);
    }
  });

  it("read / unread touch only the caller", async () => {
    const a = await msg(w, "a");
    const b = await msg(w, "b");
    await raw(b, { readBy: [w.owner] });
    as(w.memberA);
    const res = await bulk({ ids: [String(a), String(b)], action: "read" });
    expect(await res.json()).toEqual({ success: true, modified: 2 });
    expect((await readers(b)).sort()).toEqual([String(w.owner), String(w.memberA)].sort());
    await bulk({ ids: [String(a), String(b)], action: "unread" });
    expect(await readers(a)).toEqual([]);
    expect(await readers(b)).toEqual([String(w.owner)]);
  });

  it("archive / unarchive need message:triage (MEMBER 403, even as assignee)", async () => {
    const a = await msg(w, "a", { assignedTo: w.memberA });
    as(w.memberA);
    expect((await bulk({ ids: [String(a)], action: "archive" })).status).toBe(403);
    as(w.admin);
    expect((await (await bulk({ ids: [String(a)], action: "archive" })).json()).modified).toBe(1);
    expect((await rawDoc(a))!.archivedBy).toEqual(w.admin);
    expect((await (await bulk({ ids: [String(a)], action: "unarchive" })).json()).modified).toBe(1);
    expect(await rawDoc(a)).not.toHaveProperty("archivedAt");
  });

  it("foreign ids (other org, other team, member threads) are never modified", async () => {
    const mine = await msg(w, "mine");
    const teamB = await msg(w, "b", { questionId: w.qB });
    const thread = await msg(w, "t", { questionId: w.qInternal, authorType: "member", authorUserId: w.memberA });
    const foreign = (
      await MessageModel.create({ content: "f", createdFor: w.outsider, organizationId: w.other })
    )._id as Id;
    const all = [mine, teamB, thread, foreign].map(String);

    as(w.memberA);
    expect((await (await bulk({ ids: all, action: "read" })).json()).modified).toBe(1);
    expect(await readers(mine)).toEqual([String(w.memberA)]);
    for (const id of [teamB, thread, foreign]) expect(await readers(id)).toEqual([]);

    // Even an OWNER can't reach another org's messages or member threads.
    as(w.owner);
    expect((await (await bulk({ ids: all, action: "archive" })).json()).modified).toBe(2);
    expect(await rawDoc(foreign)).not.toHaveProperty("archivedAt");
    expect(await rawDoc(thread)).not.toHaveProperty("archivedAt");

    // The outsider's active org is theirs; our ids don't match there.
    as(w.outsider);
    expect((await (await bulk({ ids: all, action: "read" })).json()).modified).toBe(1);
    expect(await readers(mine)).toEqual([String(w.memberA)]);
  });

  it("rate-limited at 30 per 10 minutes", async () => {
    const a = await msg(w, "a");
    as(w.owner);
    await RateLimitHitModel.create({
      key: `bulk:${w.owner}`,
      windowStart: new Date(Math.floor(Date.now() / 600_000) * 600_000),
      count: 30,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect((await bulk({ ids: [String(a)], action: "read" })).status).toBe(429);
  });
});

describe("POST /api/messages/bulk — markAllRead", () => {
  it("general scope marks only the caller's unread general messages in scope", async () => {
    const g1 = await msg(w, "g1");
    const g2 = await msg(w, "g2", { archivedAt: new Date() });
    const q = await msg(w, "q", { questionId: w.qOrg });
    as(w.memberA);
    const body = await (await bulk({ scope: { general: true }, action: "markAllRead" })).json();
    expect(body).toEqual({ success: true, modified: 2, hasMore: false });
    expect(await readers(g1)).toEqual([String(w.memberA)]);
    expect(await readers(g2)).toEqual([String(w.memberA)]);
    expect(await readers(q)).toEqual([]);
  });

  it("question scope respects team scope and never touches member threads", async () => {
    const b = await msg(w, "b", { questionId: w.qB });
    const t = await msg(w, "t", { questionId: w.qInternal, authorType: "member", authorUserId: w.memberA });
    as(w.memberA);
    expect(
      (await (await bulk({ scope: { questionId: String(w.qB) }, action: "markAllRead" })).json()).modified
    ).toBe(0);
    expect(
      (await (await bulk({ scope: { questionId: String(w.qInternal) }, action: "markAllRead" })).json())
        .modified
    ).toBe(0);
    as(w.memberB);
    expect(
      (await (await bulk({ scope: { questionId: String(w.qB) }, action: "markAllRead" })).json()).modified
    ).toBe(1);
    expect(await readers(b)).toEqual([String(w.memberB)]);
    expect(await readers(t)).toEqual([]);
  });

  it("caps at 1000 per call and reports hasMore", async () => {
    await MessageModel.collection.insertMany(
      Array.from({ length: 1003 }, (_, i) => ({
        content: `m${i}`,
        createdFor: w.owner,
        organizationId: w.org,
        questionId: null,
        createdAt: new Date(),
      }))
    );
    as(w.owner);
    const first = await (await bulk({ scope: { general: true }, action: "markAllRead" })).json();
    expect(first).toEqual({ success: true, modified: 1000, hasMore: true });
    const second = await (await bulk({ scope: { general: true }, action: "markAllRead" })).json();
    expect(second).toEqual({ success: true, modified: 3, hasMore: false });
  });
});
