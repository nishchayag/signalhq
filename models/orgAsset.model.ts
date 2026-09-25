import mongoose, { Document, Schema } from "mongoose";
import { ALLOWED_LOGO_CONTENT_TYPES, type LogoContentType } from "@/lib/brandingConstants";

// Only "logo" exists today, but kept as an enum (not hardcoded "logo"
// everywhere) so a second asset kind doesn't need a schema migration.
export const ORG_ASSET_KINDS = ["logo"] as const;
export type OrgAssetKind = (typeof ORG_ASSET_KINDS)[number];

export interface IOrgAsset extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  kind: OrgAssetKind;
  // The sniffed type (lib/logoValidation.ts), never the client's declared
  // Content-Type — this is what the public logo route serves back verbatim.
  contentType: LogoContentType;
  bytes: Buffer;
  size: number;
  sha256: string;
  createdAt: Date;
}

const OrgAssetSchema: Schema<IOrgAsset> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    kind: { type: String, enum: ORG_ASSET_KINDS, required: true },
    contentType: { type: String, enum: ALLOWED_LOGO_CONTENT_TYPES, required: true },
    // select: false — default-deny, same posture as Message.ai/embedding.
    // Only the public logo GET route and the upload/delete handlers ever
    // need these bytes; every other query (org list/get, resolveActiveContext,
    // dashboard reads) must never pull them in, so nothing here is returned
    // unless a caller explicitly asks with .select("+bytes").
    bytes: { type: Buffer, required: true, select: false },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// One asset of a given kind per org (currently just one logo per org).
OrgAssetSchema.index({ organizationId: 1, kind: 1 }, { unique: true });

const OrgAssetModel =
  (mongoose.models.OrgAsset as mongoose.Model<IOrgAsset>) ||
  mongoose.model<IOrgAsset>("OrgAsset", OrgAssetSchema);

export default OrgAssetModel;
