import { createHmac } from "crypto";
import mongoose from "mongoose";
import IntegrationModel, { type IIntegration } from "@/models/integration.model";
import MessageModel from "@/models/message.model";
import QuestionModel from "@/models/question.model";
import TeamModel from "@/models/team.model";
import OrganizationModel from "@/models/organization.model";
import type { IntegrationEvent, IntegrationPayloadMode } from "@/lib/integrationConstants";
import { INTEGRATION_AUTO_DISABLE_THRESHOLD } from "@/lib/integrationConstants";
import { isValidObjectId } from "@/lib/objectId";
import { getOrgPlan } from "@/lib/aiQuota";
import { hasFeature } from "@/lib/plans";
import { formatAnswer } from "@/lib/answers";
import { buildPublicUrl } from "@/lib/publicUrl";
import { logActivity } from "@/lib/auditLog";
import { openSecret, openTargetUrl } from "@/lib/integrations";
import { postJson, UrlNotAllowedError, type Transport } from "@/lib/safeHttp";

// Delivers message events to an org's Slack/webhook integrations. Kept
// separate from lib/notifications.ts on purpose: some tests mock
// "@/lib/notifications" wholesale, and this module has its own (much
// stricter) privacy rules about what a delivery may ever contain.

export type MessageEventType = IntegrationEvent; // "message.created" | "message.followup"

type Id = string | mongoose.Types.ObjectId;

// ---- Test-only injection point (mirrors lib/ai.ts's __setTestProvider) ---
let testTransport: Transport | null = null;
/** Test-only: inject a fake transport for every postJson call this module
 * makes. Pass null to clear. Real network use under Vitest still throws
 * (lib/safeHttp.ts's own guard) if this isn't set. */
export function __setTestTransport(transport: Transport | null): void {
  testTransport = transport;
}

// ---- Payload shape --------------------------------------------------------

export interface PayloadMessage {
  id: string;
  createdAt: string;
  content: string;
  answer: string;
  question: { id: string; text: string } | null;
  team: { name: string } | null;
  ai: { sentiment?: string; tags?: string[] } | null;
}

export interface FullPayloadData {
  message: PayloadMessage;
  followup?: { content: string };
  dashboardUrl: string;
}

export interface NudgePayloadData {
  question: { text: string };
  dashboardUrl: string;
}

export interface WebhookPayload {
  version: 1;
  id: string;
  type: MessageEventType;
  createdAt: string;
  organization: { name: string; slug?: string };
  data: FullPayloadData | NudgePayloadData;
}

/** Everything buildPayload/buildSlackBody need — assembled once per dispatch
 * (not per integration), then reused for every integration the event goes to. */
export interface BuildPayloadInput {
  deliveryId: string;
  type: MessageEventType;
  eventAt: Date;
  organization: { name: string; slug: string };
  message: {
    id: string;
    content: string;
    answerText: string;
    question: { id: string; text: string } | null;
    team: { name: string } | null;
    ai: { sentiment?: string; tags?: string[] } | null;
  };
  followupContent?: string;
  dashboardUrl: string;
}

export function buildPayload(mode: IntegrationPayloadMode, input: BuildPayloadInput): WebhookPayload {
  const base = {
    version: 1 as const,
    id: input.deliveryId,
    type: input.type,
    createdAt: input.eventAt.toISOString(),
  };
  if (mode === "nudge") {
    return {
      ...base,
      organization: { name: input.organization.name },
      data: {
        question: { text: input.message.question?.text || "New feedback" },
        dashboardUrl: input.dashboardUrl,
      },
    };
  }
  return {
    ...base,
    organization: { name: input.organization.name, slug: input.organization.slug },
    data: {
      message: {
        id: input.message.id,
        createdAt: input.eventAt.toISOString(),
        content: input.message.content,
        answer: input.message.answerText,
        question: input.message.question,
        team: input.message.team,
        ai: input.message.ai,
      },
      ...(input.followupContent !== undefined && { followup: { content: input.followupContent } }),
      dashboardUrl: input.dashboardUrl,
    },
  };
}

const SLACK_TEXT_MAX = 2900; // Slack section blocks cap plain_text around 3000.

/** Slack Block Kit body. Every user-supplied string is `plain_text` (never
 * `mrkdwn`), so `<!channel>`/`<!here>` and link markup are inert literal
 * text, never rendered as mentions or links. `unfurl_*` are off so a URL a
 * sender pasted never triggers a link preview. */
export function buildSlackBody(mode: IntegrationPayloadMode, input: BuildPayloadInput): Record<string, unknown> {
  const headerText =
    input.type === "message.followup"
      ? "New follow-up on SignalHQ"
      : input.message.question
        ? "New response on SignalHQ"
        : "New feedback on SignalHQ";

  const lines: string[] = [];
  if (mode === "full") {
    if (input.message.question?.text) lines.push(input.message.question.text);
    if (input.message.answerText) lines.push(`Answer: ${input.message.answerText}`);
    if (input.message.content) lines.push(input.message.content);
    if (input.followupContent) lines.push(`Follow-up: ${input.followupContent}`);
    if (input.message.team?.name) lines.push(`Team: ${input.message.team.name}`);
    if (input.message.ai?.sentiment) lines.push(`Sentiment: ${input.message.ai.sentiment}`);
  } else {
    lines.push(input.message.question?.text || "New feedback received");
  }

  const text = [headerText, ...lines].join("\n").slice(0, SLACK_TEXT_MAX);
  return {
    text: headerText, // fallback text for notifications/screen readers
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      { type: "section", text: { type: "plain_text", text, emoji: true } },
      {
        type: "context",
        elements: [{ type: "plain_text", text: input.organization.name, emoji: true }],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open in SignalHQ" },
            url: input.dashboardUrl,
          },
        ],
      },
    ],
  };
}

/** `v1=<hex hmac-sha256>` of `${timestamp}.${body}`, keyed by the webhook's
 * signing secret. Verification snippet (a4) recomputes this and compares
 * with `timingSafeEqual` under a tolerance window on `timestamp`. */
export function sign(secret: string, timestamp: string, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// ---- Dispatch --------------------------------------------------------------

export async function hasActiveIntegrations(organizationId: Id | null | undefined): Promise<boolean> {
  if (!organizationId || !isValidObjectId(String(organizationId))) return false;
  const count = await IntegrationModel.countDocuments({ organizationId: String(organizationId), enabled: true });
  return count > 0;
}

const DELIVERY_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 300;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function extractHttpStatus(err: unknown): number | undefined {
  const status = (err as { statusCode?: unknown })?.statusCode;
  return typeof status === "number" ? status : undefined;
}

type LeanIntegration = IIntegration;

async function attemptDelivery(
  integration: LeanIntegration,
  input: BuildPayloadInput
): Promise<{ status: number }> {
  const orgId = String(integration.organizationId);
  const integrationId = String(integration._id);
  const targetUrl = openTargetUrl(orgId, integrationId, integration.targetUrlEnc);
  const opts = { timeoutMs: DELIVERY_TIMEOUT_MS, transport: testTransport ?? undefined };

  if (integration.kind === "slack") {
    const body = JSON.stringify(buildSlackBody(integration.payloadMode, input));
    return postJson(targetUrl, body, "slack", opts);
  }

  const secret = integration.secretEnc ? openSecret(orgId, integrationId, integration.secretEnc) : "";
  const body = JSON.stringify(buildPayload(integration.payloadMode, input));
  const timestamp = String(Math.floor(Date.now() / 1000));
  return postJson(targetUrl, body, "webhook", {
    ...opts,
    headers: {
      "X-SignalHQ-Event": input.type,
      "X-SignalHQ-Delivery": input.deliveryId,
      "X-SignalHQ-Timestamp": timestamp,
      "X-SignalHQ-Signature": sign(secret, timestamp, body),
    },
  });
}

/** One inline retry on 5xx/429/timeout (network error); never on another 4xx. */
async function deliverWithRetry(
  send: () => Promise<{ status: number }>
): Promise<{ status: number } | { error: unknown }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await send();
      if (attempt === 1 && isRetryableStatus(res.status)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return res;
    } catch (err) {
      // A blocked URL fails the same way every time, so don't retry it.
      if (attempt === 1 && !(err instanceof UrlNotAllowedError)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return { error: err };
    }
  }
  /* istanbul ignore next -- unreachable, keeps TS happy about the loop */
  return { error: new Error("unreachable") };
}

async function recordSuccess(integrationId: string, status: number, now: Date): Promise<void> {
  await IntegrationModel.updateOne(
    { _id: integrationId },
    {
      $set: {
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastStatus: "ok",
        lastHttpStatus: status,
        consecutiveFailures: 0,
      },
    }
  );
}

async function recordFailure(integration: LeanIntegration, err: unknown, now: Date): Promise<void> {
  const httpStatus = extractHttpStatus(err);
  const update: Record<string, unknown> = {
    $set: {
      lastAttemptAt: now,
      lastStatus: "fail",
      ...(httpStatus !== undefined && { lastHttpStatus: httpStatus }),
    },
    $inc: { consecutiveFailures: 1 },
  };
  // A network-level failure (connection refused, timeout, blocked URL — no
  // HTTP response at all) has no httpStatus of its own. Without this, a
  // stale lastHttpStatus from a previous, unrelated HTTP failure or success
  // would keep showing in the settings UI (e.g. "HTTP error (200)" for a
  // target that's actually unreachable), contradicting
  // lib/integrationsUi.ts#deliveryStatusInfo's documented fallback of
  // "Couldn't reach the target" for exactly this case.
  if (httpStatus === undefined) {
    update.$unset = { lastHttpStatus: "" };
  }
  const updated = await IntegrationModel.findOneAndUpdate(
    { _id: integration._id },
    update,
    { new: true }
  );
  if (!updated || !updated.enabled || updated.consecutiveFailures < INTEGRATION_AUTO_DISABLE_THRESHOLD) {
    return;
  }
  // Conditional so two concurrent failing deliveries can't both "win" the
  // auto-disable and double-log it.
  const disabled = await IntegrationModel.findOneAndUpdate(
    {
      _id: integration._id,
      enabled: true,
      consecutiveFailures: { $gte: INTEGRATION_AUTO_DISABLE_THRESHOLD },
    },
    {
      $set: {
        enabled: false,
        disabledAt: now,
        disabledReason: "auto_disabled_consecutive_failures",
      },
    },
    { new: true }
  );
  if (disabled) {
    await logActivity({
      organizationId: String(disabled.organizationId),
      // No human actor — the activity UI renders this as "System".
      actorUserId: undefined,
      action: "integration.auto_disabled",
      metadata: { kind: disabled.kind, host: disabled.targetHost, name: disabled.name },
    });
  }
}

async function deliverOne(integration: LeanIntegration, input: BuildPayloadInput): Promise<void> {
  const now = new Date();
  const outcome = await deliverWithRetry(() => attemptDelivery(integration, input));
  if ("error" in outcome) {
    await recordFailure(integration, outcome.error, now);
  } else if (outcome.status >= 200 && outcome.status < 300) {
    await recordSuccess(integration._id, outcome.status, now);
  } else {
    await recordFailure(integration, Object.assign(new Error(`status ${outcome.status}`), { statusCode: outcome.status }), now);
  }
}

interface DispatchableMessage {
  _id: mongoose.Types.ObjectId;
  content?: string;
  answer?: Parameters<typeof formatAnswer>[0];
  createdAt: Date;
  organizationId?: mongoose.Types.ObjectId;
  questionId?: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  authorType?: string;
  replies?: { authorRole: string; content: string }[];
  ai?: { sentiment?: string; tags?: string[] };
}

const MESSAGE_SELECT = "content answer createdAt organizationId questionId teamId authorType replies +ai";

/**
 * Load the message for dispatch with an explicit field list (never
 * replyToken/authorUserId/createdFor/readBy/embedding/toxicity/pii/piiFlag),
 * and apply the defence-in-depth skip rules: a member-authored message, or
 * one on an internal-visibility question, is never dispatched (the primary
 * defence is that lib/messageEvents.ts and the answer route never call
 * dispatch for these at all).
 */
async function loadDispatchableMessage(
  messageId: Id,
  orgId: string
): Promise<null | {
  msg: DispatchableMessage;
  question: { id: string; text: string } | null;
  team: { name: string } | null;
  followupContent?: string;
}> {
  if (!isValidObjectId(String(messageId))) return null;
  const msg = await MessageModel.findOne({ _id: String(messageId), organizationId: orgId })
    .select(MESSAGE_SELECT)
    .lean<DispatchableMessage>();
  if (!msg) return null;
  if (msg.authorType === "member") return null;

  let question: { id: string; text: string } | null = null;
  if (msg.questionId) {
    const q = await QuestionModel.findById(msg.questionId)
      .select("questionText visibility")
      .lean<{ questionText: string; visibility?: string }>();
    if (!q) return null;
    if (q.visibility === "internal") return null;
    question = { id: String(msg.questionId), text: q.questionText };
  }

  let team: { name: string } | null = null;
  if (msg.teamId) {
    const t = await TeamModel.findById(msg.teamId).select("name").lean<{ name: string }>();
    if (t) team = { name: t.name };
  }

  const lastReply = msg.replies && msg.replies.length > 0 ? msg.replies[msg.replies.length - 1] : undefined;
  const followupContent = lastReply?.authorRole === "sender" ? lastReply.content : undefined;

  return { msg, question, team, followupContent };
}

export interface TestEventResult {
  ok: boolean;
  status: "ok" | "fail";
  httpStatus?: number;
}

/**
 * Send a fixed, synthetic sample event to an integration's target — used by
 * the settings UI's "test connection" button. Reuses the same payload
 * builders and delivery path as a real dispatch (so a test send is a
 * faithful preview), but with no retry (diagnostic — report the first
 * result promptly) and without touching consecutiveFailures/auto-disable.
 * Never throws: network/SSRF failures and, under Vitest, lib/safeHttp.ts's
 * real-network guard all resolve to `{ok:false}`.
 */
export async function sendTestEvent(integration: LeanIntegration): Promise<TestEventResult> {
  const now = new Date();
  const sampleInput: BuildPayloadInput = {
    deliveryId: new mongoose.Types.ObjectId().toString(),
    type: "message.created",
    eventAt: now,
    organization: { name: "Test organization", slug: "test-organization" },
    message: {
      id: new mongoose.Types.ObjectId().toString(),
      content: "This is a test event from SignalHQ.",
      answerText: "",
      question: null,
      team: null,
      ai: null,
    },
    dashboardUrl: buildPublicUrl("/dashboard"),
  };
  try {
    const { status } = await attemptDelivery(integration, sampleInput);
    const ok = status >= 200 && status < 300;
    return { ok, status: ok ? "ok" : "fail", httpStatus: status };
  } catch (err) {
    return { ok: false, status: "fail", httpStatus: extractHttpStatus(err) };
  }
}

export interface DispatchMessageEventInput {
  organizationId: Id | null | undefined;
  messageId: Id;
  event: MessageEventType;
  /** For "message.followup": when the follow-up happened, used as the
   * event's timestamp instead of the message's original createdAt. */
  followupAt?: Date;
}

/**
 * Deliver a message event to every one of the org's enabled integrations
 * subscribed to it. Never throws — every failure mode (no integrations,
 * downgraded plan, message gone/ineligible, an individual delivery failing)
 * just means fewer or no deliveries, logged internally by the per-delivery
 * bookkeeping, never by throwing back to the caller (always invoked from
 * runAfter, but kept safe regardless).
 */
export async function dispatchMessageEvent(input: DispatchMessageEventInput): Promise<void> {
  try {
    const { organizationId, messageId, event, followupAt } = input;
    if (!organizationId || !isValidObjectId(String(organizationId))) return;
    const orgId = String(organizationId);

    const integrations = await IntegrationModel.find({
      organizationId: orgId,
      enabled: true,
      events: event,
    }).select("+targetUrlEnc +secretEnc");
    if (integrations.length === 0) return;

    const plan = await getOrgPlan(orgId);
    if (!hasFeature(plan, "integrations")) return;

    const loaded = await loadDispatchableMessage(messageId, orgId);
    if (!loaded) return;

    const org = await OrganizationModel.findById(orgId)
      .select("name slug")
      .lean<{ name: string; slug: string }>();
    if (!org) return;

    const deliveryId = new mongoose.Types.ObjectId().toString();
    const eventAt = event === "message.followup" && followupAt ? followupAt : loaded.msg.createdAt;
    const payloadInput: BuildPayloadInput = {
      deliveryId,
      type: event,
      eventAt,
      organization: { name: org.name, slug: org.slug },
      message: {
        id: String(loaded.msg._id),
        content: loaded.msg.content ?? "",
        answerText: formatAnswer(loaded.msg.answer),
        question: loaded.question,
        team: loaded.team,
        ai: loaded.msg.ai ? { sentiment: loaded.msg.ai.sentiment, tags: loaded.msg.ai.tags } : null,
      },
      followupContent: loaded.followupContent,
      dashboardUrl: buildPublicUrl(`/dashboard/messages/${String(loaded.msg._id)}`),
    };

    await Promise.allSettled(
      integrations.map((integration) =>
        deliverOne(integration, payloadInput)
      )
    );
  } catch (err) {
    console.error(
      "[webhooks] dispatch failed:",
      err instanceof Error ? err.name : typeof err
    );
  }
}
