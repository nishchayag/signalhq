import mongoose, { Document, Schema } from "mongoose";
import {
  LABEL_COLORS,
  LABEL_NAME_MAX,
  ORG_MAX_LABELS,
  type LabelColor,
} from "@/lib/triageConstants";
import {
  BRANDING_ACCENTS,
  WELCOME_TEXT_MAX,
  type BrandingAccent,
} from "@/lib/brandingConstants";

export { LABEL_COLORS, LABEL_NAME_MAX, ORG_MAX_LABELS, type LabelColor };
export { BRANDING_ACCENTS, type BrandingAccent };

export type OrganizationPlan = "FREE" | "PRO" | "ENTERPRISE";

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
  // Public-page branding (Phase 2). Small (a palette key + short text + a
  // counter) — logo BYTES never live here, they're a separate OrgAsset row
  // keyed by organizationId, so resolveActiveContext loading this doc on
  // every dashboard call never pulls image bytes along with it. Absent
  // until the org first sets branding or uploads a logo; every field reads
  // correctly when missing (lib/branding.ts#brandingView supplies defaults).
  // Gated at READ time by PLAN_FEATURES.branding (lib/plans.ts), not here —
  // a downgrade keeps this data but lib/branding.ts#getEffectiveBranding
  // stops surfacing it publicly.
  branding?: {
    accent?: BrandingAccent;
    welcomeText?: string;
    logoVersion?: number;
  };
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
    // Sub-schema (not a nested object) so `branding` stays undefined on
    // orgs that never touch it, instead of defaulting to `{}` — mirrors
    // Message.ai in models/message.model.ts.
    branding: {
      type: new Schema(
        {
          accent: { type: String, enum: BRANDING_ACCENTS },
          welcomeText: { type: String, trim: true, maxlength: WELCOME_TEXT_MAX },
          logoVersion: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      required: false,
      default: undefined,
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
