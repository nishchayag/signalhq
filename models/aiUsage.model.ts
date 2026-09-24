import mongoose, { Document, Schema } from "mongoose";

/** Every metered AI feature — one quota bucket each (lib/aiQuota.ts). */
export const AI_FEATURES = [
  "suggest",
  "enrich",
  "insights",
  "draft",
  "guard",
  "digest",
  "search",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface IAiUsage extends Document {
  organizationId: mongoose.Types.ObjectId;
  // Calendar month in UTC, "YYYY-MM". Quotas reset on the 1st.
  period: string;
  feature: AiFeature;
  count: number;
  // TTL cleanup only (~400 days after the period starts) — keeps a year of
  // history for usage display, then Mongo drops it.
  expiresAt: Date;
}

const AiUsageSchema: Schema<IAiUsage> = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  feature: { type: String, enum: AI_FEATURES, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

// One counter per (org, month, feature); lib/aiQuota.ts relies on this for
// its conditional-upsert quota check.
AiUsageSchema.index(
  { organizationId: 1, period: 1, feature: 1 },
  { unique: true }
);
AiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiUsageModel =
  (mongoose.models.AiUsage as mongoose.Model<IAiUsage>) ||
  mongoose.model<IAiUsage>("AiUsage", AiUsageSchema);

export default AiUsageModel;
