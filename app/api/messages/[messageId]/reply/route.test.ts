import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET, POST } from "@/app/api/messages/[messageId]/reply/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let seq = 0;
async function setup() {
  const ownerId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: `acme-r-${seq++}`, createdBy: ownerId });
  await MembershipModel.create({ organizationId: org._id, userId: ownerId, role: "OWNER" });
  getServerSession.mockResolvedValue({ user: { _id: String(ownerId), activeOrgId: String(org._id) } });
  return { orgId: org._id, ownerId };
}

const params = (id: unknown) => ({ params: Promise.resolve({ messageId: String(id) }) });
const post = (id: unknown, content: string) =>
  POST(
    new NextRequest("http://localhost/api/messages/x/reply", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
    params(id)
  );

describe("reply route (anonymous messages)", () => {
  it("appends org turns, clears awaitingOrg and sets lastActivityAt", async () => {
    const { orgId } = await setup();
    const msg = await MessageModel.create({
      content: "hello",
      createdFor: new mongoose.Types.ObjectId(),
      organizationId: orgId,
      awaitingOrg: true,
      replies: [{ authorRole: "sender", content: "any news?", createdAt: new Date() }],
    });

    const res = await post(msg._id, "first reply");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replies.map((r: { authorRole: string }) => r.authorRole)).toEqual(["sender", "org"]);
    expect(body.turns).toHaveLength(3);

    await post(msg._id, "second reply");
    const stored = await MessageModel.findById(msg._id);
    expect(stored?.replies?.map((r: { content: string }) => r.content)).toEqual(["any news?", "first reply", "second reply"]);
    expect(stored?.awaitingOrg).toBe(false);
    expect(stored?.lastActivityAt).toBeInstanceOf(Date);
  });

  it("GET returns the thread turns and never the embedding", async () => {
    const { orgId } = await setup();
    const msg = await MessageModel.create({
      content: "hello",
      createdFor: new mongoose.Types.ObjectId(),
      organizationId: orgId,
      replies: [{ authorRole: "org", content: "earlier", createdAt: new Date("2026-01-02T00:00:00Z") }],
    });
    await MessageModel.collection.updateOne(
      { _id: msg._id as mongoose.Types.ObjectId },
      { $set: { embedding: mongoose.mongo.Binary.fromFloat32Array(new Float32Array([1, 2])) } }
    );
    const res = await GET(new NextRequest("http://localhost/x"), params(msg._id));
    const body = await res.json();
    expect(body.turns.map((t: { authorRole: string }) => t.authorRole)).toEqual(["sender", "org"]);
    expect(JSON.stringify(body)).not.toContain("embedding");
  });
});
