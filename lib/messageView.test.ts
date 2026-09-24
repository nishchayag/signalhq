import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import MessageModel from "@/models/message.model";
import { withAiView } from "@/lib/messageView";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

type Lean = { ai?: { sentiment?: string; tags?: string[] }; content?: string };

const AI = {
  status: "done",
  attempts: 1,
  lockedAt: new Date(),
  sentiment: "negative",
  tags: ["workload", "management"],
  toxicity: 0.9,
  pii: 0.7,
  piiFlag: true,
  model: "ministral-8b-latest",
  enrichedAt: new Date(),
};

async function seed() {
  const msg = await MessageModel.create({
    content: "Too many late nights",
    createdFor: new mongoose.Types.ObjectId(),
    organizationId: new mongoose.Types.ObjectId(),
    ai: AI,
  });
  const vec = new Float32Array([0.25, -1.5, 3.125, 0]);
  await MessageModel.collection.updateOne(
    { _id: msg._id },
    { $set: { embedding: mongoose.mongo.Binary.fromFloat32Array(vec), embeddingModel: "mistral-embed" } }
  );
  return { id: msg._id, vec };
}

describe("Message ai/embedding fields are select:false", () => {
  it("unprojected find/findById/findOne and lean omit ai and embedding", async () => {
    const { id } = await seed();
    const docs = [
      (await MessageModel.find({ _id: id }))[0].toObject(),
      (await MessageModel.findById(id))!.toObject(),
      (await MessageModel.findOne({ _id: id }))!.toObject(),
      (await MessageModel.findById(id).lean())!,
    ];
    for (const d of docs) {
      expect(d).not.toHaveProperty("ai");
      expect(d).not.toHaveProperty("embedding");
      expect(d).not.toHaveProperty("embeddingModel");
      expect(d.content).toBe("Too many late nights");
    }
  });

  it("an explicit field list omits them; '+ai' (alone or in a list) adds only ai", async () => {
    const { id } = await seed();
    const listed = (await MessageModel.findById(id).select("content createdAt").lean())!;
    expect(listed).not.toHaveProperty("ai");
    expect(listed).not.toHaveProperty("embedding");

    const plus = (await MessageModel.findById(id).select("+ai").lean()) as unknown as Lean;
    expect(plus.ai?.sentiment).toBe("negative");
    expect(plus).not.toHaveProperty("embedding");
    expect(plus.content).toBeDefined();

    const mixed = (await MessageModel.findById(id).select("content createdAt +ai").lean()) as unknown as Lean;
    expect(mixed.ai?.tags).toEqual(["workload", "management"]);
    expect(mixed).not.toHaveProperty("embedding");
  });

  it("saving a hydrated doc doesn't wipe the unselected ai/embedding", async () => {
    const { id, vec } = await seed();
    const doc = (await MessageModel.findById(id))!;
    doc.replies = [{ authorRole: "org", content: "Thanks", createdAt: new Date() }];
    await doc.save();
    const raw = await MessageModel.collection.findOne({ _id: id });
    expect(raw?.ai?.sentiment).toBe("negative");
    expect(Array.from((raw?.embedding as InstanceType<typeof mongoose.mongo.Binary>).toFloat32Array())).toEqual(
      Array.from(vec)
    );
  });

  it("embedding round-trips as a float32 vector (BSON Binary subtype 9)", async () => {
    const { id, vec } = await seed();
    const raw = await MessageModel.collection.findOne({ _id: id }, { projection: { embedding: 1 } });
    const bin = raw?.embedding as InstanceType<typeof mongoose.mongo.Binary>;
    expect(bin.sub_type).toBe(9);
    expect(bin.toFloat32Array()).toBeInstanceOf(Float32Array);
    expect(Array.from(bin.toFloat32Array())).toEqual(Array.from(vec));
  });

  it("creates the partial sweep index", async () => {
    await MessageModel.syncIndexes();
    const indexes = await MessageModel.collection.indexes();
    const sweep = indexes.find((i) => i.key["ai.status"] === 1);
    expect(sweep?.partialFilterExpression).toEqual({ "ai.status": { $in: ["pending", "processing", "failed"] } });
  });

  it("rejects more than 3 tags or an unknown tag", async () => {
    const base = { content: "x", createdFor: new mongoose.Types.ObjectId() };
    await expect(
      MessageModel.create({ ...base, ai: { status: "done", tags: ["tools", "process", "product", "growth"] } })
    ).rejects.toThrow();
    await expect(MessageModel.create({ ...base, ai: { status: "done", tags: ["nonsense"] } })).rejects.toThrow();
  });

  it("messages created without ai have no ai field at all", async () => {
    const msg = await MessageModel.create({ content: "x", createdFor: new mongoose.Types.ObjectId() });
    const raw = await MessageModel.collection.findOne({ _id: msg._id });
    expect(raw).not.toHaveProperty("ai");
  });
});

describe("withAiView", () => {
  const doc = {
    _id: "m1",
    content: "hi",
    ai: AI,
    embedding: "vector",
    embeddingModel: "mistral-embed",
  };

  it("MEMBER gets sentiment and tags only", () => {
    const [v] = withAiView([doc], "MEMBER");
    expect(v.ai).toEqual({ sentiment: "negative", tags: ["workload", "management"] });
    expect(v).not.toHaveProperty("embedding");
    expect(v).not.toHaveProperty("embeddingModel");
  });

  it("OWNER/ADMIN also get toxicity/pii/piiFlag, never bookkeeping", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const [v] = withAiView([doc], role);
      expect(v.ai).toEqual({
        sentiment: "negative",
        tags: ["workload", "management"],
        toxicity: 0.9,
        pii: 0.7,
        piiFlag: true,
      });
    }
  });

  it("memberThread drops ai entirely, even for an OWNER", () => {
    const [v] = withAiView([doc], "OWNER", { memberThread: true });
    expect(v).not.toHaveProperty("ai");
  });

  it("a pending message (no results yet) has no ai key; null role is MEMBER-level", () => {
    const [pending] = withAiView([{ ...doc, ai: { status: "pending", attempts: 0 } }], "OWNER");
    expect(pending).not.toHaveProperty("ai");
    const [legacy] = withAiView([doc], null);
    expect(legacy.ai).toEqual({ sentiment: "negative", tags: ["workload", "management"] });
  });
});
