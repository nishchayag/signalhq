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
});

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
