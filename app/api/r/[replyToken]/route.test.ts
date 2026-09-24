import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession, notifyNewMessage } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  notifyNewMessage: vi.fn(async () => {}),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/notifications", () => ({ notifyNewMessage }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET, POST } from "@/app/api/r/[replyToken]/route";
import { POST as orgReply } from "@/app/api/messages/[messageId]/reply/route";
import { GET as getMessages } from "@/app/api/getMessages/route";
import { tokenKey } from "@/lib/receipt";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";
import RateLimitHitModel from "@/models/rateLimitHit.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  notifyNewMessage.mockClear();
});
afterAll(stopTestDB);

const IP = "203.0.113.77";
let seq = 0;

async function anonMessage(extra: Record<string, unknown> = {}) {
  const token = `tok_${seq++}_${"x".repeat(20)}`;
  const createdFor = new mongoose.Types.ObjectId();
  const msg = await MessageModel.create({
    content: "The rota is unfair",
    createdFor,
    organizationId: new mongoose.Types.ObjectId(),
    replyToken: token,
    ai: { status: "done", attempts: 1, sentiment: "negative", toxicity: 0.9 },
    ...extra,
  });
  await MessageModel.collection.updateOne(
    { _id: msg._id as mongoose.Types.ObjectId },
    { $set: { embedding: mongoose.mongo.Binary.fromFloat32Array(new Float32Array([1, 2])) } }
  );
  return { msg, token, createdFor };
}

const params = (replyToken: string) => ({ params: Promise.resolve({ replyToken }) });
const get = (token: string) => GET(new NextRequest(`http://localhost/api/r/${token}`), params(token));
function post(token: string, content: unknown, ip = IP) {
  return POST(
    new NextRequest(`http://localhost/api/r/${token}`, {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ content }),
    }),
    params(token)
  );
}

function expectSafe(body: unknown) {
  const s = JSON.stringify(body);
  for (const bad of ["embedding", "sentiment", "toxicity", "\"ai\"", "_id", "createdFor", "organizationId"]) {
    expect(s).not.toContain(bad);
  }
}

describe("GET /api/r/:replyToken", () => {
  it("returns only turns + awaitingOrg", async () => {
    const { token } = await anonMessage({
      reply: { content: "legacy reply", repliedAt: new Date("2026-01-02T00:00:00Z") },
    });
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["awaitingOrg", "turns"]);
    expect(body.turns.map((t: { authorRole: string }) => t.authorRole)).toEqual(["sender", "org"]);
    expectSafe(body);
  });

  it("404s unknown and member-thread tokens with identical bodies", async () => {
    const { token } = await anonMessage({ authorType: "member", authorUserId: new mongoose.Types.ObjectId() });
    const a = await get("nope-unknown");
    const b = await get(token);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await a.json()).toEqual(await b.json());
  });
});

describe("POST /api/r/:replyToken", () => {
  it("appends a sender turn, sets awaitingOrg, notifies the recipient", async () => {
    const { msg, token, createdFor } = await anonMessage();
    const res = await post(token, "Any update on this?");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.awaitingOrg).toBe(true);
    expect(body.turns.map((t: { authorRole: string; content: string }) => `${t.authorRole}:${t.content}`)).toEqual([
      "sender:The rota is unfair",
      "sender:Any update on this?",
    ]);
    expectSafe(body);
    expect(notifyNewMessage).toHaveBeenCalledWith(String(createdFor));

    const stored = await MessageModel.findById(msg._id).select("+ai");
    expect(stored?.awaitingOrg).toBe(true);
    expect(stored?.lastActivityAt).toBeInstanceOf(Date);
    // Follow-ups aren't AI-enriched: ai is untouched.
    expect(stored?.ai?.status).toBe("done");
  });

  it("an org reply afterwards clears awaitingOrg", async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({ name: "Acme", slug: `acme-f-${seq++}`, createdBy: ownerId });
    await MembershipModel.create({ organizationId: org._id, userId: ownerId, role: "OWNER" });
    const { msg, token } = await anonMessage({ organizationId: org._id });
    await post(token, "hello?");
    getServerSession.mockResolvedValue({ user: { _id: String(ownerId), activeOrgId: String(org._id) } });
    const list = await (await getMessages(new NextRequest("http://localhost/api/getMessages"))).json();
    expect(list.messages[0].awaitingOrg).toBe(true);
    expect(typeof list.messages[0].lastActivityAt).toBe("string");
    const res = await orgReply(
      new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ content: "On it" }) }),
      { params: Promise.resolve({ messageId: String(msg._id) }) }
    );
    expect(res.status).toBe(200);
    const body = await (await get(token)).json();
    expect(body.awaitingOrg).toBe(false);
    expect(body.turns).toHaveLength(3);
  });

  it("404s unknown and member-thread tokens with identical bodies", async () => {
    const { token } = await anonMessage({ authorType: "member", authorUserId: new mongoose.Types.ObjectId() });
    const a = await post("nope-unknown", "hi", "198.51.100.1");
    const b = await post(token, "hi", "198.51.100.2");
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await a.json()).toEqual(await b.json());
    expect(notifyNewMessage).not.toHaveBeenCalled();
  });

  it("400s empty content and moderated content", async () => {
    const { token } = await anonMessage();
    expect((await post(token, "", "198.51.100.3")).status).toBe(400);
    const res = await post(token, "you are a fucking idiot", "198.51.100.4");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/couldn't be sent/);
  });

  it("caps a thread at 50 turns (409)", async () => {
    const replies = Array.from({ length: 49 }, (_, i) => ({
      authorRole: i % 2 ? "sender" : "org",
      content: `t${i}`,
      createdAt: new Date(Date.now() - (60 - i) * 1000),
    }));
    const { token } = await anonMessage({ replies });
    const res = await post(token, "one more");
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("This conversation has reached its limit");
  });

  it("rate-limits 5 per IP per 10 minutes, keyed by a hashed IP", async () => {
    const { token } = await anonMessage();
    for (let i = 0; i < 5; i++) expect((await post(token, `f${i}`)).status).toBe(201);
    expect((await post(token, "f6")).status).toBe(429);
    const keys = (await RateLimitHitModel.find({}).lean()).map((d) => d.key as string);
    expect(keys.some((k) => k.startsWith("followup:ip:"))).toBe(true);
    expect(keys.some((k) => k === `followup:tok:${tokenKey(token)}`)).toBe(true);
    for (const k of keys) {
      expect(k).not.toContain(IP);
      expect(k).not.toContain(token);
    }
  });

  it("rate-limits 20 per token per day, checked before the lookup", async () => {
    const { token } = await anonMessage();
    const windowMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    await RateLimitHitModel.create({
      key: `followup:tok:${tokenKey(token)}`,
      windowStart,
      count: 20,
      expiresAt: new Date(windowStart.getTime() + windowMs + 60_000),
    });
    const res = await post(token, "21st");
    expect(res.status).toBe(429);
    // An unknown token is limited the same way (no DB-dependent branch first).
    await RateLimitHitModel.create({
      key: `followup:tok:${tokenKey("ghost")}`,
      windowStart,
      count: 20,
      expiresAt: new Date(windowStart.getTime() + windowMs + 60_000),
    });
    expect((await post("ghost", "x", "198.51.100.9")).status).toBe(429);
  });
});
