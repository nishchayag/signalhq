import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { migrateAnonReplies } from "@/scripts/migrate-anon-replies";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

const coll = () => MessageModel.collection;
const base = () => ({
  content: "feedback",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  createdFor: new mongoose.Types.ObjectId(),
  organizationId: new mongoose.Types.ObjectId(),
});
const repliedAt = new Date("2026-01-02T00:00:00Z");

describe("migrateAnonReplies", () => {
  it("moves the legacy reply into replies[] exactly once, even when run twice", async () => {
    const { insertedId } = await coll().insertOne({
      ...base(),
      reply: { content: "Thanks!", repliedAt },
      replies: [],
    });

    expect(await migrateAnonReplies(coll(), { dryRun: true })).toEqual({ matched: 1, migrated: 0, cleared: 0 });
    expect((await coll().findOne({ _id: insertedId }))?.reply).toBeDefined(); // dry run wrote nothing

    expect(await migrateAnonReplies(coll())).toEqual({ matched: 1, migrated: 1, cleared: 0 });
    expect(await migrateAnonReplies(coll())).toEqual({ matched: 0, migrated: 0, cleared: 0 });

    const doc = await coll().findOne({ _id: insertedId });
    expect(doc?.reply).toBeUndefined();
    expect(doc?.replies).toHaveLength(1);
    expect(doc?.replies[0]).toMatchObject({ authorRole: "org", content: "Thanks!", createdAt: repliedAt });
    expect(doc?.lastActivityAt).toEqual(repliedAt);
    // Readable through the model (sub-doc schema, enum).
    const hydrated = await MessageModel.findById(insertedId);
    expect(hydrated?.replies?.[0].authorRole).toBe("org");
  });

  it("clears a reply already present in replies[] without duplicating it", async () => {
    const { insertedId } = await coll().insertOne({
      ...base(),
      reply: { content: "Thanks!", repliedAt },
      replies: [{ _id: new mongoose.Types.ObjectId(), authorRole: "org", content: "Thanks!", createdAt: repliedAt }],
    });
    expect(await migrateAnonReplies(coll())).toMatchObject({ migrated: 0, cleared: 1 });
    const doc = await coll().findOne({ _id: insertedId });
    expect(doc?.replies).toHaveLength(1);
    expect(doc?.reply).toBeUndefined();
  });

  it("leaves docs without a reply and member threads untouched", async () => {
    const plain = await coll().insertOne({ ...base(), replies: [] });
    const member = await coll().insertOne({
      ...base(),
      authorType: "member",
      authorUserId: new mongoose.Types.ObjectId(),
      reply: { content: "odd legacy", repliedAt },
      replies: [{ _id: new mongoose.Types.ObjectId(), authorRole: "member", content: "f", createdAt: repliedAt }],
    });
    const before = await coll().find({}).sort({ _id: 1 }).toArray();
    expect(await migrateAnonReplies(coll())).toEqual({ matched: 0, migrated: 0, cleared: 0 });
    const after = await coll().find({}).sort({ _id: 1 }).toArray();
    expect(after).toEqual(before);
    void plain;
    void member;
  });
});
