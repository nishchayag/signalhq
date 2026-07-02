import mongoose, { Schema, Document } from "mongoose";

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
  // message, not an open thread.
  reply?: {
    content: string;
    repliedAt: Date;
  };
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
});

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
