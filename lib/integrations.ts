import { createHmac, randomBytes } from "crypto";
import mongoose from "mongoose";
import type { IIntegration } from "@/models/integration.model";
import { open, seal } from "@/lib/secretBox";
import { postJson } from "@/lib/safeHttp";
import { buildPublicUrl } from "@/lib/publicUrl";

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

export interface TestEventResult {
  ok: boolean;
  status: "ok" | "fail";
  httpStatus?: number;
}

const TEST_EVENT_TIMEOUT_MS = 5000;

/**
 * Send a fixed, synthetic sample event to an integration's target — used by
 * the "test connection" button. Never throws (network/SSRF failures and,
 * under Vitest, lib/safeHttp.ts's real-network guard all resolve to
 * `{ok:false}`) so the route can always answer 200 with a coarse result.
 *
 * NOTE: this builds its own minimal payload rather than reusing
 * lib/webhooks.ts (Phase 4a3's dispatch payload builder), since that module
 * (and the shared retry/delivery-bookkeeping it introduces) lands in a
 * later commit. Once it exists, this should delegate to it so a test send
 * exercises the exact same payload shape as a real delivery.
 */
export async function sendIntegrationTestEvent(integration: IIntegration): Promise<TestEventResult> {
  const orgId = String(integration.organizationId);
  const integrationId = String(integration._id);
  try {
    const targetUrl = openTargetUrl(orgId, integrationId, integration.targetUrlEnc);
    const now = new Date();

    if (integration.kind === "slack") {
      const body = JSON.stringify({
        text: "SignalHQ test event",
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "This is a test event from SignalHQ.", emoji: true },
          },
        ],
        unfurl_links: false,
        unfurl_media: false,
      });
      const { status } = await postJson(targetUrl, body, "slack", { timeoutMs: TEST_EVENT_TIMEOUT_MS });
      return statusResult(status);
    }

    const secret = integration.secretEnc ? openSecret(orgId, integrationId, integration.secretEnc) : "";
    const deliveryId = new mongoose.Types.ObjectId().toString();
    const payload = {
      version: 1,
      id: deliveryId,
      type: "message.created",
      createdAt: now.toISOString(),
      organization: { name: "Test organization", slug: "test-organization" },
      data: {
        question: { text: "This is a test event from SignalHQ." },
        dashboardUrl: buildPublicUrl("/dashboard"),
      },
    };
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    const { status } = await postJson(targetUrl, body, "webhook", {
      timeoutMs: TEST_EVENT_TIMEOUT_MS,
      headers: {
        "X-SignalHQ-Event": "message.created",
        "X-SignalHQ-Delivery": deliveryId,
        "X-SignalHQ-Timestamp": timestamp,
        "X-SignalHQ-Signature": signature,
      },
    });
    return statusResult(status);
  } catch {
    return { ok: false, status: "fail" };
  }
}

function statusResult(status: number): TestEventResult {
  const ok = status >= 200 && status < 300;
  return { ok, status: ok ? "ok" : "fail", httpStatus: status };
}
