// Client-safe helpers for app/dashboard/_components/IntegrationsSettings.tsx
// — pure, DB-free, mongoose-free (mirrors lib/brandingUi.ts). Kept separate
// from the component so the mapping logic (error codes -> copy, delivery
// status -> label/tone, timestamp -> relative time) is unit-testable
// without rendering React.
import axios from "axios";
import { apiError } from "@/lib/apiError";
import { INTEGRATION_MAX_PER_ORG } from "@/lib/integrationConstants";
import type { IntegrationEvent, IntegrationKind, IntegrationLastStatus } from "@/lib/integrationConstants";

export const INTEGRATION_KIND_LABEL: Record<IntegrationKind, string> = {
  slack: "Slack",
  webhook: "Webhook",
};

export const INTEGRATION_EVENT_LABEL: Record<IntegrationEvent, string> = {
  "message.created": "New message",
  "message.followup": "Sender follow-up",
};

/**
 * The human-readable reason a create/update/rotate/test call failed, for
 * toasts. Server-specific codes (see app/api/organizations/[orgId]/
 * integrations/**) are mapped to friendlier, actionable copy; anything else
 * falls back to lib/apiError.ts's generic `message`/`error` handling.
 */
export function integrationErrorMessage(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const data = e.response?.data as { message?: string; code?: string } | undefined;
    if (status === 400 && data?.code === "URL_NOT_ALLOWED") {
      return "That URL isn't allowed. Use a public https URL (Slack: hooks.slack.com).";
    }
    if (status === 409 && data?.code === "LIMIT") {
      return `You can have up to ${INTEGRATION_MAX_PER_ORG} integrations.`;
    }
    if (status === 503 && data?.code === "INTEGRATIONS_UNAVAILABLE") {
      return "Integrations aren't configured on this server yet.";
    }
    if (status === 403 && data?.code === "PLAN_UPGRADE_REQUIRED") {
      return data.message || "Integrations are available on the Pro plan and up.";
    }
  }
  return apiError(e, fallback);
}

export type DeliveryStatusTone = "neutral" | "success" | "danger";

export interface DeliveryStatusInfo {
  text: string;
  tone: DeliveryStatusTone;
}

/**
 * The row's "last delivery status" label. The model only ever stores a
 * coarse `lastStatus: "ok" | "fail"` plus an optional `lastHttpStatus`
 * (lib/webhooks.ts never distinguishes timeout/network/TLS/blocked beyond
 * that — see attemptDelivery/sendTestEvent) — so a failure without an HTTP
 * status is reported as an unreachable target rather than guessing which of
 * those it was.
 */
export function deliveryStatusInfo(
  lastStatus: IntegrationLastStatus | null,
  lastHttpStatus: number | null
): DeliveryStatusInfo {
  if (lastStatus === null) return { text: "No deliveries yet", tone: "neutral" };
  if (lastStatus === "ok") return { text: "Delivered OK", tone: "success" };
  if (lastHttpStatus != null) return { text: `HTTP error (${lastHttpStatus})`, tone: "danger" };
  return { text: "Couldn't reach the target", tone: "danger" };
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 minutes ago" / "in 2 hours" style relative time, for a timestamp that
 * might be in the past (deliveries) or future (n/a here, but kept general). */
export function relativeTimeFrom(at: string | Date, now: Date | string = new Date()): string {
  const then = typeof at === "string" ? new Date(at) : at;
  const reference = typeof now === "string" ? new Date(now) : now;
  const diffSec = Math.round((reference.getTime() - then.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffSec) < 45) return "just now";
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= secs) {
      const value = Math.round(diffSec / secs);
      return rtf.format(-value, unit);
    }
  }
  return rtf.format(-diffSec, "second");
}
