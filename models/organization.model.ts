import mongoose, { Document, Schema } from "mongoose";

export type OrganizationPlan = "FREE" | "PRO" | "ENTERPRISE";

export interface IOrganization extends Document {
  _id: string;
  name: string;
  slug: string;
  createdBy: mongoose.Types.ObjectId;
  // Billing tier. No payment processing exists yet — every plan is free to
  // use during early access, but the feature limits per tier (see
  // lib/plans.ts) are enforced now so the gating logic is already correct
  // once pricing goes live.
  plan: OrganizationPlan;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema: Schema<IOrganization> = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    // Immutable, URL-safe identifier. Used for public/org-scoped routing.
    slug: {
      type: String,
      required: [true, "Slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      immutable: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
    },
    plan: {
      type: String,
      enum: ["FREE", "PRO", "ENTERPRISE"],
      default: "FREE",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const OrganizationModel =
  (mongoose.models.Organization as mongoose.Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default OrganizationModel;
