import mongoose, { Schema, Document } from "mongoose";

export type MessageAuthorType = "anonymous" | "member";
export type ThreadEntryAuthorRole = "member" | "org";

// AI enrichment (lib/aiEnrichment.ts). Fixed enums so model output can't
// invent labels; the tag list is also what C7 insights and filters key on.
export const AI_STATUSES = ["pending", "processing", "done", "failed", "skipped_quota"] as const;
export type AiStatus = (typeof AI_STATUSES)[number];
export const AI_SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type AiSentiment = (typeof AI_SENTIMENTS)[number];
export const AI_TAGS = [
  "management",
  "communication",
  "workload",
  "culture",
  "compensation",
  "process",
  "tools",
  "product",
  "customer-service",
  "recognition",
  "growth",
  "wellbeing",
  "safety",
  "praise",
  "other",
] as const;
export type AiTag = (typeof AI_TAGS)[number];
export const AI_MAX_TAGS = 3;

export interface IMessageAi {
  status: AiStatus;
  attempts: number;
  lockedAt?: Date | null;
  sentiment?: AiSentiment;
  tags?: AiTag[];
  toxicity?: number; // 0..1, max abuse-category moderation score
  pii?: number; // 0..1, moderation PII score
  piiFlag?: boolean; // pii >= 0.5
  model?: string;
  enrichedAt?: Date;
}

export interface IThreadEntry {
  authorRole: ThreadEntryAuthorRole;
  content: string;
  createdAt: Date;
}

export interface IMessage extends Document {
  content: string;
  createdAt: Date;
  createdFor: mongoose.Types.ObjectId;
  questionId?: mongoose.Types.ObjectId; // Reference to specific question (optional for backward compatibility)
  // Owning organization. Optional during multi-tenant migration; backfilled
  // for existing messages, required once the migration completes.
  organizationId?: mongoose.Types.ObjectId;
  // Optional owning team, mirrored from the question it answers (if any) so
  // team-scoped reads don't need to join through Question.
  teamId?: mongoose.Types.ObjectId;
  // Unguessable token letting the anonymous sender check for a reply later
  // (e.g. /r/[replyToken]), with no account/session involved. Always set by
  // every message-creation route going forward; optional at the schema level
  // (not backfilled) so replying to a pre-existing message without one
  // doesn't fail validation on save.
  replyToken?: string;
  // Single reply from the recipient, if any — deliberately one reply per
  // message, not an open thread. Still the only reply mechanism for
  // anonymous (public-question) messages; untouched by member threading.
  reply?: {
    content: string;
    repliedAt: Date;
  };
  // Identifies a member's private answer to an internal question. Absent
  // (undefined) for every anonymous/public-question message — the default,
  // pre-existing behavior. Set only via the internal-question answer flow.
  authorType?: MessageAuthorType;
  authorUserId?: mongoose.Types.ObjectId; // ref: User — set iff authorType === "member"
  // Ordered thread continuation for a member's private answer: their own
  // follow-ups (authorRole "member") interleaved with OWNER/ADMIN replies
  // (authorRole "org"). `content` above is always the thread's first turn.
  replies?: IThreadEntry[];
  // AI enrichment. `select: false` (default deny): only routes that ask for
  // "+ai" get it, and they must pass docs through lib/messageView.ts's
  // withAiView so MEMBERs never see toxicity/PII.
  ai?: IMessageAi;
  // BSON Binary float32 vector (subtype 9). Never returned by any route.
  // Read/write it only through MessageModel.collection (raw driver) with
  // mongoose.mongo.Binary.fromFloat32Array / .toFloat32Array() — see
  // lib/aiEnrichment.ts. Absent until embedded (the sweep backfills).
  embedding?: unknown;
  embeddingModel?: string;
}

const messageSchema: Schema<IMessage> = new Schema({
  content: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  createdFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Question",
    required: false, // Optional for backward compatibility
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: false, // Optional during migration; backfilled for existing messages
    index: true,
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: false,
    index: true,
  },
  replyToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  // A true sub-schema (not a plain nested object) so `reply` itself stays
  // `undefined` until a reply is actually saved — a plain nested object path
  // would default every new document to `{}` (truthy, with undefined leaves)
  // instead, breaking `if (message.reply)` checks everywhere.
  reply: {
    type: new Schema(
      {
        content: { type: String },
        repliedAt: { type: Date },
      },
      { _id: false }
    ),
    required: false,
  },
  authorType: {
    type: String,
    enum: ["anonymous", "member"],
    required: false,
  },
  authorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
    index: true,
  },
  replies: {
    type: [
      new Schema(
        {
          authorRole: { type: String, enum: ["member", "org"], required: true },
          content: { type: String, required: true },
          createdAt: { type: Date, required: true, default: Date.now },
        },
        { _id: true }
      ),
    ],
    default: [],
    required: false,
  },
  // Sub-schema (not a nested object) so `ai` stays undefined on messages
  // created with AI off, instead of defaulting to `{}`.
  ai: {
    type: new Schema(
      {
        status: { type: String, enum: AI_STATUSES, required: true },
        attempts: { type: Number, default: 0 },
        lockedAt: { type: Date },
        sentiment: { type: String, enum: AI_SENTIMENTS },
        tags: {
          type: [{ type: String, enum: AI_TAGS }],
          default: undefined,
          validate: {
            validator: (v: unknown[] | undefined) => !v || v.length <= AI_MAX_TAGS,
            message: `At most ${AI_MAX_TAGS} tags`,
          },
        },
        toxicity: { type: Number, min: 0, max: 1 },
        pii: { type: Number, min: 0, max: 1 },
        piiFlag: { type: Boolean },
        model: { type: String },
        enrichedAt: { type: Date },
      },
      { _id: false }
    ),
    required: false,
    select: false,
  },
  // Mixed so Mongoose never casts the BSON Binary vector (a Buffer path would
  // rewrap it and drop the float32 subtype). Raw driver access only.
  embedding: { type: Schema.Types.Mixed, select: false },
  embeddingModel: { type: String, select: false },
});

// Covers the two hot list queries (general messages: questionId == null;
// per-question messages: questionId == <id>), both always scoped to and
// sorted within one organization.
messageSchema.index({ organizationId: 1, questionId: 1, createdAt: -1 });
// Per-question reads (question GET, export, replies, answer, and the delete
// cascade) filter on questionId WITHOUT organizationId, so the compound
// index above can't serve them — they were collection scans.
messageSchema.index({ questionId: 1, createdAt: -1 });
// Legacy-message cleanup on account delete filters by recipient.
messageSchema.index({ createdFor: 1 });
// Enrichment sweep (lib/aiEnrichment.ts#enrichPending): only unfinished
// messages (incl. "processing", so a crashed run's stale lock is found),
// oldest first. `$in` in a partial filter needs MongoDB 6.0+.
messageSchema.index(
  { "ai.status": 1, createdAt: 1 },
  { partialFilterExpression: { "ai.status": { $in: ["pending", "processing", "failed"] } } }
);

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
