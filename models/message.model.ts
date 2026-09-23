import mongoose, { Schema, Document } from "mongoose";

export type MessageAuthorType = "anonymous" | "member";
export type ThreadEntryAuthorRole = "member" | "org";

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

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
