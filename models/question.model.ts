import mongoose, { Document, Schema } from "mongoose";
import {
  MAX_RESPONSES_LIMIT,
  OPTION_LABEL_MAX,
  QUESTION_TYPES,
  SCALE_LABEL_MAX,
  type QuestionConfig,
  type QuestionType,
} from "@/lib/answers";

export type QuestionVisibility = "public" | "internal";

export interface IQuestion extends Document {
  _id: string;
  questionText: string;
  description?: string;
  isActive: boolean;
  userId: mongoose.Types.ObjectId;
  // Owning organization. Optional during multi-tenant migration; backfilled
  // for existing questions, required once the migration completes.
  organizationId?: mongoose.Types.ObjectId;
  // Optional owning team within the organization. When set, the question is
  // scoped to that team; when null it is an org-level question.
  teamId?: mongoose.Types.ObjectId;
  slug: string; // Unique identifier for the question URL
  // "public" (default): anyone with the link can answer anonymously, as
  // today. "internal": no public link access at all — only logged-in org
  // members (team-scoped) can answer, and each member's answer is a private
  // thread visible only to them + OWNER/ADMIN, not to other members.
  visibility: QuestionVisibility;
  createdAt: Date;
  updatedAt: Date;
  responseCount: number;
  // Typed questions (lib/answers.ts). Missing type ⇒ "text" (every question
  // from before typed questions); missing config ⇒ defaults.
  type?: QuestionType;
  config?: QuestionConfig;
  // Closing. Closed state is computed (lib/answers.ts#questionState), never
  // stored: past `closesAt`, or `responseCount >= maxResponses`. Both absent ⇒
  // open indefinitely.
  closesAt?: Date | null;
  maxResponses?: number | null;
}

const QuestionSchema: Schema<IQuestion> = new Schema(
  {
    questionText: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
      maxlength: [500, "Question text cannot exceed 500 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    visibility: {
      type: String,
      enum: ["public", "internal"],
      default: "public",
      required: true,
    },
    responseCount: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      enum: QUESTION_TYPES,
      default: "text",
    },
    // Sub-schema so it stays undefined on text questions instead of `{}`.
    config: {
      type: new Schema(
        {
          options: {
            type: [
              new Schema(
                {
                  id: { type: String, required: true },
                  label: { type: String, required: true, trim: true, maxlength: OPTION_LABEL_MAX },
                },
                { _id: false }
              ),
            ],
            default: undefined,
          },
          allowComment: { type: Boolean },
          scaleLabels: {
            type: new Schema(
              {
                min: { type: String, trim: true, maxlength: SCALE_LABEL_MAX },
                max: { type: String, trim: true, maxlength: SCALE_LABEL_MAX },
              },
              { _id: false }
            ),
            required: false,
          },
          maxSelections: { type: Number, min: 1 },
        },
        { _id: false }
      ),
      required: false,
    },
    closesAt: { type: Date, default: undefined },
    maxResponses: { type: Number, min: 1, max: MAX_RESPONSES_LIMIT, default: undefined },
  },
  {
    timestamps: true,
  }
);

// Create compound index for userId and slug
QuestionSchema.index({ userId: 1, slug: 1 });
QuestionSchema.index({ slug: 1 }, { unique: true });

const QuestionModel =
  (mongoose.models.Question as mongoose.Model<IQuestion>) ||
  mongoose.model<IQuestion>("Question", QuestionSchema);

export default QuestionModel;
