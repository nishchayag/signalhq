import mongoose, { Schema, Document } from "mongoose";
import { MESSAGE_MAX_LABELS } from "@/lib/triageConstants";
import { ANSWER_KINDS, type MessageAnswer } from "@/lib/answers";

export type MessageAuthorType = "anonymous" | "member";
// "member": a member's own turns in their private thread; "org": OWNER/ADMIN
// replies (either kind of thread); "sender": an anonymous author's follow-up
// through their /r/[replyToken] link.
export const THREAD_AUTHOR_ROLES = ["member", "org", "sender"] as const;
export type ThreadEntryAuthorRole = (typeof THREAD_AUTHOR_ROLES)[number];

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
  // The free-text turn 1. For a typed answer (`answer` set) it's the optional
  // comment and may be "" — required only when there is no `answer`.
  content: string;
  // A typed question's structured answer (lib/answers.ts). Absent for text
  // questions and general feedback. Render with lib/answers.ts#formatAnswer.
  answer?: MessageAnswer;
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
  // Identifies a member's private answer to an internal question. Absent
  // (undefined) for every anonymous/public-question message — the default,
  // pre-existing behavior. Set only via the internal-question answer flow.
  authorType?: MessageAuthorType;
  authorUserId?: mongoose.Types.ObjectId; // ref: User — set iff authorType === "member"
  // Ordered thread continuation after the first turn (`content`). Member
  // threads: the member's follow-ups ("member") and OWNER/ADMIN replies
  // ("org"). Anonymous messages: org replies ("org") and the sender's
  // follow-ups ("sender"). Append-only. Read it through lib/thread.ts#threadOf.
  replies?: IThreadEntry[];
  // Last time a turn was added (absent ⇒ no turn since creation; use createdAt).
  lastActivityAt?: Date;
  // Last INBOUND turn: creation, a sender follow-up, or a member's own
  // follow-up in their private thread — never an org reply. Read state
  // (lib/readState.ts) keys on this, so an org reply doesn't make a
  // pre-join message unread for someone who joined in between. Absent ⇒
  // createdAt (messages from before the field existed).
  lastInboundAt?: Date;
  // An anonymous sender followed up and the org hasn't replied since.
  awaitingOrg?: boolean;
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
  // ---- Triage (Phase 2). Every field reads correctly when missing. ----
  // Members who have read this message. `select: false`, never returned by
  // any route: lib/messageView.ts#withAiView strips it and exposes a
  // per-viewer `read` boolean instead (see lib/readState.ts, which also
  // applies Membership.readSince). Absent ⇒ read by nobody. No index.
  readBy?: mongoose.Types.ObjectId[];
  // Archived ("resolved"); absent/null ⇒ open. `{archivedAt: null}` matches both.
  archivedAt?: Date | null;
  archivedBy?: mongoose.Types.ObjectId;
  // Ids of Organization.labels entries (≤ MESSAGE_MAX_LABELS). Absent ⇒ none.
  labels?: mongoose.Types.ObjectId[];
  // Assigned org member; absent/null ⇒ unassigned.
  assignedTo?: mongoose.Types.ObjectId | null;
  assignedAt?: Date;
  assignedBy?: mongoose.Types.ObjectId;
}

export { MESSAGE_MAX_LABELS };

const messageSchema: Schema<IMessage> = new Schema({
  content: {
    type: String,
    // Mongoose's `required` rejects "", so a typed answer with no comment
    // needs the requirement lifted — only when an answer is present.
    required: function (this: IMessage) {
      return !this.answer;
    },
    default: "",
  },
  answer: {
    type: new Schema(
      {
        kind: { type: String, enum: ANSWER_KINDS, required: true },
        score: { type: Number },
        choices: { type: [String], default: undefined },
        labels: { type: [String], default: undefined },
      },
      { _id: false }
    ),
    required: false,
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
          authorRole: { type: String, enum: THREAD_AUTHOR_ROLES, required: true },
          content: { type: String, required: true },
          createdAt: { type: Date, required: true, default: Date.now },
        },
        { _id: true }
      ),
    ],
    default: [],
    required: false,
  },
  lastActivityAt: { type: Date, required: false },
  lastInboundAt: { type: Date, required: false },
  awaitingOrg: { type: Boolean, default: false },
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
  // Triage. `default: undefined` on the arrays so untouched messages don't
  // store empty arrays (and stay out of the labels partial index).
  readBy: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    default: undefined,
    select: false,
  },
  archivedAt: { type: Date, default: undefined },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  labels: {
    type: [{ type: mongoose.Schema.Types.ObjectId }],
    default: undefined,
    validate: {
      validator: (v: unknown[] | undefined) => !v || v.length <= MESSAGE_MAX_LABELS,
      message: `At most ${MESSAGE_MAX_LABELS} labels`,
    },
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  assignedAt: { type: Date },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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

// Triage filters ("Assigned to me" / assignee=<id>, label=<id>) within one
// org, newest first. Partial so the (majority) never-assigned / unlabelled
// messages cost nothing. `$exists: true`, not `$type: "objectId"`: measured
// on MongoDB 8.2 (models/indexes.test.ts), the planner doesn't treat
// `assignedTo: <ObjectId>` as implying `$type`, so a $type-partial index is
// never even a candidate; an equality match does imply `$exists`. $exists
// partial filters work on every supported MongoDB incl. Atlas 8.0. So that
// the index stays "assigned only", unassign should `$unset` assignedTo
// (null would still be indexed — harmless, just larger). `assignedTo: null`
// (assignee=none) can't use it and falls back to the org-prefixed indexes.
messageSchema.index(
  { organizationId: 1, assignedTo: 1, createdAt: -1 },
  { partialFilterExpression: { assignedTo: { $exists: true } } }
);
messageSchema.index(
  { organizationId: 1, labels: 1, createdAt: -1 },
  { partialFilterExpression: { labels: { $exists: true } } }
);

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
