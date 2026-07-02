import mongoose, { Document, Schema } from "mongoose";

export interface IRateLimitHit extends Document {
  // e.g. "sendMessage:203.0.113.4" — route name + client IP.
  key: string;
  // Start of the fixed window this hit belongs to.
  windowStart: Date;
  count: number;
  // TTL cleanup only — correctness comes from `windowStart` bucketing in the
  // query, not from timely deletion. Mongo's TTL reaper runs on a ~60s
  // interval, so expired docs can briefly outlive `expiresAt`; that's fine.
  expiresAt: Date;
}

const RateLimitHitSchema: Schema<IRateLimitHit> = new Schema({
  key: { type: String, required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

// One counter document per (key, window).
RateLimitHitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitHitModel =
  (mongoose.models.RateLimitHit as mongoose.Model<IRateLimitHit>) ||
  mongoose.model<IRateLimitHit>("RateLimitHit", RateLimitHitSchema);

export default RateLimitHitModel;
