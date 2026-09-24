import mongoose, { Document, Schema } from "mongoose";

export type AuditAction =
  | "organization.renamed"
  | "organization.deleted"
  | "organization.plan_changed"
  | "organization.ownership_transferred"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "invitation.created"
  | "invitation.revoked"
  | "label.created"
  | "label.updated"
  | "label.deleted";

export interface IAuditLog extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  actorUserId: mongoose.Types.ObjectId;
  action: AuditAction;
  // Free-form context specific to `action` (e.g. { from: "MEMBER", to: "ADMIN",
  // targetUserId }) — not strongly typed since every action shape differs.
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema: Schema<IAuditLog> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });

const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLogModel;
