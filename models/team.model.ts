import mongoose, { Document, Schema } from "mongoose";

export interface ITeam extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  // URL/identifier slug, unique *within* an organization (not globally).
  slug: string;
  createdBy: mongoose.Types.ObjectId;
  // Members of this team (subset of the org's members). A user may belong to
  // multiple teams, so membership is modelled as an array of user refs here
  // rather than on the org Membership document.
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema: Schema<ITeam> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Team name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      trim: true,
      lowercase: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Slug is unique per organization, not globally.
TeamSchema.index({ organizationId: 1, slug: 1 }, { unique: true });

const TeamModel =
  (mongoose.models.Team as mongoose.Model<ITeam>) ||
  mongoose.model<ITeam>("Team", TeamSchema);

export default TeamModel;
