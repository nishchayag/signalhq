import mongoose, { Document, Schema } from "mongoose";

export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export interface IMembership extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MembershipRole;
  // Messages whose last activity is before this count as read for this
  // member (so joining doesn't flood them with the backlog). Missing ⇒
  // createdAt — read it through lib/readState.ts#effectiveReadSince.
  readSince?: Date;
  // Per-org mute: no notification emails from this org for this member.
  notificationsMuted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema: Schema<IMembership> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    // Roles live on the membership, not the user, so the same user can hold
    // different roles across organizations.
    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "MEMBER"],
      default: "MEMBER",
      required: true,
    },
    readSince: { type: Date, required: false },
    notificationsMuted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// A user can have at most one membership per organization.
MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
// "All of this user's memberships, oldest first" runs on every session
// resolution (resolveActiveContext / getActiveOrgForToken fallback, org
// switcher, /u redirect); the compound above leads with organizationId and
// can't serve it.
MembershipSchema.index({ userId: 1, createdAt: 1 });

const MembershipModel =
  (mongoose.models.Membership as mongoose.Model<IMembership>) ||
  mongoose.model<IMembership>("Membership", MembershipSchema);

export default MembershipModel;
