import { randomBytes } from "crypto";
import type { IIntegration } from "@/models/integration.model";
import { open, seal } from "@/lib/secretBox";

// Thin, named wrappers around lib/secretBox.ts's generic seal/open so every
// caller uses the same AAD field names ("targetUrl" / "secret") consistently
// — a typo'd field string would silently make an old blob unopenable.

export function sealTargetUrl(orgId: string, integrationId: string, url: string): string {
  return seal(url, orgId, integrationId, "targetUrl");
}

export function openTargetUrl(orgId: string, integrationId: string, blob: string): string {
  return open(blob, orgId, integrationId, "targetUrl");
}

export function sealSecret(orgId: string, integrationId: string, secret: string): string {
  return seal(secret, orgId, integrationId, "secret");
}

export function openSecret(orgId: string, integrationId: string, blob: string): string {
  return open(blob, orgId, integrationId, "secret");
}

/** A new webhook signing secret, shown once on create/rotate. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Last 4 characters of a plaintext secret, for the settings UI. */
export function secretHintOf(secret: string): string {
  return secret.slice(-4);
}

/** The subset of an Integration doc safe to ever return from an API route:
 * never targetUrlEnc/secretEnc (they're select:false, so this is also a
 * belt-and-braces shape guard even if a caller forgets to omit them). */
export function integrationView(doc: IIntegration) {
  return {
    _id: String(doc._id),
    kind: doc.kind,
    name: doc.name,
    enabled: doc.enabled,
    payloadMode: doc.payloadMode,
    events: doc.events,
    targetHost: doc.targetHost,
    secretHint: doc.secretHint ?? null,
    lastAttemptAt: doc.lastAttemptAt ?? null,
    lastSuccessAt: doc.lastSuccessAt ?? null,
    lastStatus: doc.lastStatus ?? null,
    lastHttpStatus: doc.lastHttpStatus ?? null,
    consecutiveFailures: doc.consecutiveFailures,
    disabledAt: doc.disabledAt ?? null,
    disabledReason: doc.disabledReason ?? null,
    createdAt: doc.createdAt,
  };
}

export type IntegrationView = ReturnType<typeof integrationView>;
