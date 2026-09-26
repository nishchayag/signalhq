import mongoose, { Document, Schema } from "mongoose";
import {
  INTEGRATION_EVENTS,
  INTEGRATION_KINDS,
  INTEGRATION_LAST_STATUSES,
  INTEGRATION_NAME_MAX,
  INTEGRATION_PAYLOAD_MODES,
  type IntegrationEvent,
  type IntegrationKind,
  type IntegrationLastStatus,
  type IntegrationPayloadMode,
} from "@/lib/integrationConstants";

export {
  INTEGRATION_EVENTS,
  INTEGRATION_KINDS,
  INTEGRATION_PAYLOAD_MODES,
  type IntegrationEvent,
  type IntegrationKind,
  type IntegrationLastStatus,
  type IntegrationPayloadMode,
};

// A Slack incoming-webhook or a generic signed webhook that message events
// are delivered to (lib/webhooks.ts). Deliberately a separate collection,
// not embedded on Organization: it holds encrypted secrets (select:false)
// and per-integration delivery bookkeeping that has no business being on
// the org doc every dashboard call loads.
export interface IIntegration extends Document {
  _id: string;
  organizationId: mongoose.Types.ObjectId;
  kind: IntegrationKind;
  name: string;
  enabled: boolean;
  // "full": text, answer, question, AI sentiment/tags. "nudge": no message
  // content at all, just "a question got a response" + a dashboard link.
  payloadMode: IntegrationPayloadMode;
  events: IntegrationEvent[];
  // Plain hostname of the target (e.g. "hooks.slack.com"), kept unencrypted
  // so the settings UI and audit metadata can show/log it without ever
  // decrypting the full URL.
  targetHost: string;
  // lib/secretBox.ts sealed blob (AES-256-GCM) of the full target URL.
  // select:false: only the dispatcher and the routes that explicitly need
  // it (create/update/rotate/test) ever load it.
  targetUrlEnc: string;
  // Webhook signing secret, sealed the same way. Absent for kind:"slack"
  // (a Slack incoming webhook has no signature scheme of its own).
  secretEnc?: string;
  // Last 4 characters of the plaintext secret (e.g. for "…a1b2"), so the
  // settings UI can show which secret is active without ever re-displaying
  // it. Absent for kind:"slack".
  secretHint?: string;
  createdBy: mongoose.Types.ObjectId;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastStatus?: IntegrationLastStatus;
  lastHttpStatus?: number;
  // Consecutive delivery failures; reset to 0 on any success or when an
  // admin re-enables the integration. Auto-disables at
  // INTEGRATION_AUTO_DISABLE_THRESHOLD (lib/webhooks.ts).
  consecutiveFailures: number;
  disabledAt?: Date;
  disabledReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const IntegrationSchema: Schema<IIntegration> = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    kind: { type: String, enum: INTEGRATION_KINDS, required: true },
    name: { type: String, required: true, trim: true, maxlength: INTEGRATION_NAME_MAX },
    enabled: { type: Boolean, default: true },
    payloadMode: {
      type: String,
      enum: INTEGRATION_PAYLOAD_MODES,
      default: "full",
      required: true,
    },
    events: {
      type: [{ type: String, enum: INTEGRATION_EVENTS }],
      default: () => [...INTEGRATION_EVENTS],
    },
    targetHost: { type: String, required: true },
    targetUrlEnc: { type: String, required: true, select: false },
    secretEnc: { type: String, select: false },
    secretHint: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastAttemptAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastStatus: { type: String, enum: INTEGRATION_LAST_STATUSES },
    lastHttpStatus: { type: Number },
    consecutiveFailures: { type: Number, default: 0 },
    disabledAt: { type: Date },
    disabledReason: { type: String },
  },
  { timestamps: true }
);

// Dispatch's hot query: an org's currently-enabled integrations.
IntegrationSchema.index({ organizationId: 1, enabled: 1 });

const IntegrationModel =
  (mongoose.models.Integration as mongoose.Model<IIntegration>) ||
  mongoose.model<IIntegration>("Integration", IntegrationSchema);

export default IntegrationModel;
