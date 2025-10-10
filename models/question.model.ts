import mongoose, { Document, Schema } from "mongoose";

export interface IQuestion extends Document {
  _id: string;
  questionText: string;
  description?: string;
  isActive: boolean;
  userId: mongoose.Types.ObjectId;
  slug: string; // Unique identifier for the question URL
  createdAt: Date;
  updatedAt: Date;
  responseCount: number;
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
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    responseCount: {
      type: Number,
      default: 0,
    },
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
