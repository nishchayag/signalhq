import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import MessageModel from "@/models/message.model";
import { effectiveReadSince, isReadFor, unreadClause } from "@/lib/readState";
import { withAiView } from "@/lib/messageView";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

const viewerId = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const T = new Date("2026-06-01T00:00:00Z");
const before = new Date("2026-05-01T00:00:00Z");
const after = new Date("2026-07-01T00:00:00Z");

describe("effectiveReadSince", () => {
  it("prefers readSince, falls back to createdAt, else null", () => {
    expect(effectiveReadSince({ readSince: after, createdAt: before })).toBe(after);
    expect(effectiveReadSince({ createdAt: before })).toBe(before);
    expect(effectiveReadSince({})).toBeNull();
  });
});

describe("isReadFor and unreadClause agree", () => {
  it("across readBy × createdAt × lastActivityAt × readSince", async () => {
    const cases: { name: string; doc: Record<string, unknown> }[] = [];
    let n = 0;
    for (const readBy of [undefined, [], [other], [other, viewerId]]) {
      for (const createdAt of [before, after]) {
        for (const lastActivityAt of [undefined, null, before, after]) {
          if (lastActivityAt && lastActivityAt < createdAt) continue;
          const name = `m${n++}`;
          const doc: Record<string, unknown> = { content: name, createdAt };
          if (readBy !== undefined) doc.readBy = readBy;
          if (lastActivityAt !== undefined) doc.lastActivityAt = lastActivityAt;
          cases.push({ name, doc });
        }
      }
    }
    const orgId = new mongoose.Types.ObjectId();
    await MessageModel.collection.insertMany(
      cases.map((c) => ({ ...c.doc, createdFor: other, organizationId: orgId }))
    );

    for (const readSince of [null, T]) {
      const viewer = { userId: String(viewerId), readSince };
      const unread = new Set(
        (await MessageModel.find({ organizationId: orgId, $and: [unreadClause(viewer)] }).select("content").lean<{ content: string }[]>())
          .map((d) => d.content)
      );
      const docs = await MessageModel.find({ organizationId: orgId }).select("+readBy").lean<Record<string, unknown>[]>();
      for (const d of docs) {
        const read = isReadFor(d, viewer);
        expect({ c: d.content, readSince, unread: unread.has(d.content as string) }).toEqual({
          c: d.content,
          readSince,
          unread: !read,
        });
      }
    }
  });

  it("isReadFor: viewer in readBy wins; old activity before readSince counts as read", () => {
    const v = { userId: String(viewerId), readSince: T };
    expect(isReadFor({ readBy: [viewerId], createdAt: after }, v)).toBe(true);
    expect(isReadFor({ createdAt: before }, v)).toBe(true);
    expect(isReadFor({ createdAt: before, lastActivityAt: after }, v)).toBe(false);
    expect(isReadFor({ createdAt: after }, v)).toBe(false);
    expect(isReadFor({ createdAt: before }, { userId: String(viewerId) })).toBe(false);
  });
});

describe("readBy is never exposed", () => {
  it("unprojected find/findOne/lean omit readBy (select:false)", async () => {
    const m = await MessageModel.create({ content: "x", createdFor: other, organizationId: other });
    await MessageModel.collection.updateOne({ _id: m._id as mongoose.Types.ObjectId }, { $set: { readBy: [viewerId] } });
    for (const d of [
      (await MessageModel.find({ _id: m._id }))[0].toObject(),
      (await MessageModel.findById(m._id))!.toObject(),
      (await MessageModel.findById(m._id).lean())!,
      (await MessageModel.findByIdAndUpdate(m._id, { $set: { awaitingOrg: true } }, { new: true }))!.toObject(),
    ]) {
      expect(d).not.toHaveProperty("readBy");
    }
    const withIt = (await MessageModel.findById(m._id).select("+readBy").lean<{ readBy?: unknown[] }>())!;
    expect(withIt.readBy?.map(String)).toEqual([String(viewerId)]);
  });

  it("withAiView strips readBy always and adds read only with a viewerId", async () => {
    const m = await MessageModel.create({ content: "x", createdFor: other, organizationId: other });
    await MessageModel.collection.updateOne({ _id: m._id as mongoose.Types.ObjectId }, { $set: { readBy: [viewerId] } });
    const doc = await MessageModel.findById(m._id).select("+readBy");
    const [plain] = withAiView<Record<string, unknown>>([doc], "OWNER");
    expect(plain).not.toHaveProperty("readBy");
    expect(plain).not.toHaveProperty("read");
    const [mine] = withAiView<Record<string, unknown>>([doc], "MEMBER", { viewerId: String(viewerId) });
    expect(mine).not.toHaveProperty("readBy");
    expect(mine.read).toBe(true);
    const [theirs] = withAiView<Record<string, unknown>>([doc], "MEMBER", { viewerId: String(other) });
    expect(theirs.read).toBe(false);
  });
});
