import mongoose, { Document, Schema } from "mongoose";

export type OrganizationPlan = "FREE" | "PRO" | "ENTERPRISE";

// Label colours are the design system's brand palette keys (app/globals.css
// --brand-*, exposed as bg-brand-*), so a label renders with existing tokens.
export const LABEL_COLORS = ["yellow", "pink", "mint", "blue"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
export const ORG_MAX_LABELS = 30;
export const LABEL_NAME_MAX = 24;

export interface IOrgLabel {
  _id: mongoose.Types.ObjectId;
  name: string;
  color: LabelColor;
}

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
  // Triage labels (Message.labels holds their _ids). Small and bounded, so
  // fine on the doc resolveActiveContext loads on every dashboard call.
  labels?: IOrgLabel[];
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
    labels: {
      type: [
        new Schema<IOrgLabel>(
          {
            name: {
              type: String,
              required: true,
              trim: true,
              minlength: 1,
              maxlength: LABEL_NAME_MAX,
            },
            color: { type: String, enum: LABEL_COLORS, required: true },
          },
          { _id: true }
        ),
      ],
      default: undefined,
      validate: [
        {
          validator: (v: IOrgLabel[] | undefined) => !v || v.length <= ORG_MAX_LABELS,
          message: `At most ${ORG_MAX_LABELS} labels`,
        },
        {
          // Case-insensitive unique names. Only runs on save()/validate()
          // (and update validators) — an atomic $push must carry its own
          // guard (see the labels API).
          validator: (v: IOrgLabel[] | undefined) => {
            if (!v) return true;
            const names = v.map((l) => String(l.name ?? "").trim().toLowerCase());
            return new Set(names).size === names.length;
          },
          message: "Label names must be unique",
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Lookups by creator/current owner (deleteUnverifiedUser, sweeps).
OrganizationSchema.index({ createdBy: 1 });

const OrganizationModel =
  (mongoose.models.Organization as mongoose.Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default OrganizationModel;
