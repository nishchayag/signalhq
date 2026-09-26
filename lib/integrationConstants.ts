// Outbound integration (Slack/webhook) limits and enums, mongoose-free so
// the model, zod schemas, and route/dispatch code all share one definition
// (mirrors lib/brandingConstants.ts / lib/triageConstants.ts).

export const INTEGRATION_KINDS = ["slack", "webhook"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_PAYLOAD_MODES = ["full", "nudge"] as const;
export type IntegrationPayloadMode = (typeof INTEGRATION_PAYLOAD_MODES)[number];

// message.created: a new (top-level) anonymous message. message.followup: an
// anonymous sender's reply on an existing thread (via /r/[replyToken]).
export const INTEGRATION_EVENTS = ["message.created", "message.followup"] as const;
export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

export const INTEGRATION_NAME_MAX = 60;

/** Per-org cap on the number of integrations (Slack + webhook combined). */
export const INTEGRATION_MAX_PER_ORG = 5;

/** Consecutive delivery failures before an integration auto-disables itself. */
export const INTEGRATION_AUTO_DISABLE_THRESHOLD = 10;

export const INTEGRATION_LAST_STATUSES = ["ok", "fail"] as const;
export type IntegrationLastStatus = (typeof INTEGRATION_LAST_STATUSES)[number];
