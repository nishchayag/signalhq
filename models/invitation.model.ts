import mongoose, { Document, Schema } from "mongoose";
import type { MembershipRole } from "./membership.model";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface IInvitation extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  // Lower-cased email of the invitee. They may or may not already have an
  // account — the accept flow handles both cases.
  email: string;
  role: Exclude<MembershipRole, "OWNER">;
  // Optional team the invitee is added to on acceptance.
  teamId?: mongoose.Types.ObjectId;
  // Opaque single-use token embedded in the accept link.
  token: string;
  status: InvitationStatus;
  invitedBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema: Schema<IInvitation> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MEMBER"],
      default: "MEMBER",
      required: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"],
      default: "PENDING",
      required: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// At most one live (pending) invite per email per org. Partial index so older
// accepted/revoked rows don't block re-inviting the same address.
InvitationSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);

const InvitationModel =
  (mongoose.models.Invitation as mongoose.Model<IInvitation>) ||
  mongoose.model<IInvitation>("Invitation", InvitationSchema);

export default InvitationModel;
