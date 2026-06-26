import mongoose, { Document, Schema } from "mongoose";

export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER";

export interface IMembership extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MembershipRole;
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
  },
  {
    timestamps: true,
  }
);

// A user can have at most one membership per organization.
MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

const MembershipModel =
  (mongoose.models.Membership as mongoose.Model<IMembership>) ||
  mongoose.model<IMembership>("Membership", MembershipSchema);

export default MembershipModel;
