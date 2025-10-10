import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  content: string;
  createdAt: Date;
  createdFor: mongoose.Types.ObjectId;
  questionId?: mongoose.Types.ObjectId; // Reference to specific question (optional for backward compatibility)
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
});

const Message =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default Message;
