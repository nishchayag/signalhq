import mongoose, { Document, Schema } from "mongoose";
import { AI_SENTIMENTS, type AiSentiment } from "@/models/message.model";

export type AiInsightScope = "general" | "question";

export interface IAiInsightQuote {
  messageId: mongoose.Types.ObjectId;
  text: string;
}

export interface IAiInsightTheme {
  label: string;
  sentiment: AiSentiment;
  description: string;
  count: number;
  quotes: IAiInsightQuote[];
}

// `Document` declares its own `model()` method, which collides with this
// schema's `model` field (the AI model id that generated the insight).
export interface IAiInsight extends Omit<Document, "model"> {
  organizationId: mongoose.Types.ObjectId;
  scope: AiInsightScope;
  // Only set (non-null) when scope === "question". Explicitly stored as
  // null (not left undefined) for scope === "general" so the unique index
  // below sees a consistent value across every general-scope doc for an org.
  questionId: mongoose.Types.ObjectId | null;
  summary: string;
  themes: IAiInsightTheme[];
  actionItems: string[];
  // Total messages in scope when this insight was generated (not just the
  // subset actually sent to the model, which is capped) — compared against
  // the live count to detect staleness (lib/messageView.ts's sibling: see
  // app/api/insights/route.ts).
  sourceCount: number;
  sourceLatestAt: Date | null;
  model: string;
  generatedAt: Date;
  generatedBy: mongoose.Types.ObjectId;
}

const quoteSchema = new Schema<IAiInsightQuote>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const themeSchema = new Schema<IAiInsightTheme>(
  {
    label: { type: String, required: true, maxlength: 60 },
    sentiment: { type: String, enum: AI_SENTIMENTS, required: true },
    description: { type: String, required: true, maxlength: 200 },
    count: { type: Number, required: true, default: 0 },
    quotes: { type: [quoteSchema], default: [] },
  },
  { _id: false }
);

const aiInsightSchema: Schema<IAiInsight> = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  scope: { type: String, enum: ["general", "question"], required: true },
  questionId: { type: Schema.Types.ObjectId, ref: "Question", default: null },
  summary: { type: String, required: true, maxlength: 600 },
  themes: {
    type: [themeSchema],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length <= 6,
      message: "At most 6 themes",
    },
  },
  actionItems: {
    type: [{ type: String, maxlength: 160 }],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length <= 5,
      message: "At most 5 action items",
    },
  },
  sourceCount: { type: Number, required: true },
  sourceLatestAt: { type: Date, default: null },
  model: { type: String, required: true },
  generatedAt: { type: Date, required: true, default: Date.now },
  generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

// One insight per (org, scope, question) — questionId is explicitly null for
// "general", so every general-scope doc for an org collides on the same key
// and the index naturally enforces "at most one general insight per org" too.
aiInsightSchema.index(
  { organizationId: 1, scope: 1, questionId: 1 },
  { unique: true }
);

const AiInsightModel =
  (mongoose.models.AiInsight as mongoose.Model<IAiInsight>) ||
  mongoose.model<IAiInsight>("AiInsight", aiInsightSchema);

export default AiInsightModel;
