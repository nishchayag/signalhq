import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import IntegrationModel, { type IIntegration } from "@/models/integration.model";
import AuditLogModel from "@/models/auditLog.model";
import {
  __setTestTransport,
  buildPayload,
  buildSlackBody,
  dispatchMessageEvent,
  hasActiveIntegrations,
  sendTestEvent,
  sign,
  type BuildPayloadInput,
} from "@/lib/webhooks";
import { sealSecret, sealTargetUrl } from "@/lib/integrations";
import type { Transport } from "@/lib/safeHttp";

beforeAll(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  return startTestDB();
});
afterEach(async () => {
  await clearTestDB();
  __setTestTransport(null);
});
afterAll(async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  await stopTestDB();
});

let n = 0;
async function makeOrg(plan: "FREE" | "PRO" | "ENTERPRISE" = "PRO") {
  n++;
  const owner = new mongoose.Types.ObjectId();
  return OrganizationModel.create({ name: `Acme ${n}`, slug: `acme-${n}`, createdBy: owner, plan });
}

const WEBHOOK_SECRET = "whsec_test-secret-value";
const WEBHOOK_URL = "https://receiver.example.com/hook";
const SLACK_URL = "https://hooks.slack.com/services/T0/B0/xxxx";

async function makeIntegration(
  org: { _id: string | mongoose.Types.ObjectId; createdBy: mongoose.Types.ObjectId },
  overrides: Partial<{
    kind: "slack" | "webhook";
    name: string;
    enabled: boolean;
    payloadMode: "full" | "nudge";
    events: ("message.created" | "message.followup")[];
    consecutiveFailures: number;
  }> = {}
) {
  const _id = new mongoose.Types.ObjectId();
  const kind = overrides.kind ?? "webhook";
  const url = kind === "slack" ? SLACK_URL : WEBHOOK_URL;
  const doc = await IntegrationModel.create({
    _id,
    organizationId: org._id,
    kind,
    name: overrides.name ?? "Test integration",
    enabled: overrides.enabled ?? true,
    payloadMode: overrides.payloadMode ?? "full",
    events: overrides.events ?? ["message.created", "message.followup"],
    targetHost: new URL(url).hostname,
    targetUrlEnc: sealTargetUrl(String(org._id), String(_id), url),
    ...(kind === "webhook" && {
      secretEnc: sealSecret(String(org._id), String(_id), WEBHOOK_SECRET),
      secretHint: WEBHOOK_SECRET.slice(-4),
    }),
    createdBy: org.createdBy,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
  });
  return doc;
}

function fakeTransport(
  handler: (
    url: URL,
    body: string,
    opts: { timeoutMs: number; headers?: Record<string, string> }
  ) => { status: number } | Promise<{ status: number }>
): Transport {
  return async (url, body, opts) => handler(url, body, opts);
}

function samplePayloadInput(overrides: Partial<BuildPayloadInput> = {}): BuildPayloadInput {
  return {
    deliveryId: "delivery-1",
    type: "message.created",
    eventAt: new Date("2026-01-01T00:00:00Z"),
    organization: { name: "Acme", slug: "acme" },
    message: {
      id: "msg-1",
      content: "It was great",
      answerText: "4/5",
      question: { id: "q1", text: "How was it?" },
      team: { name: "Support" },
      ai: { sentiment: "positive", tags: ["praise"] },
    },
    dashboardUrl: "https://signal.example.com/dashboard/messages/msg-1",
    ...overrides,
  };
}

describe("buildPayload", () => {
  it("full mode includes the message, answer, question, team and ai", () => {
    const payload = buildPayload("full", samplePayloadInput());
    expect(payload).toMatchObject({
      version: 1,
      id: "delivery-1",
      type: "message.created",
      organization: { name: "Acme", slug: "acme" },
    });
    expect(payload.data).toMatchObject({
      message: {
        id: "msg-1",
        content: "It was great",
        answer: "4/5",
        question: { id: "q1", text: "How was it?" },
        team: { name: "Support" },
        ai: { sentiment: "positive", tags: ["praise"] },
      },
      dashboardUrl: "https://signal.example.com/dashboard/messages/msg-1",
    });
  });

  it("nudge mode has no message/content/answer/ai at all, just the question text", () => {
    const payload = buildPayload("nudge", samplePayloadInput());
    expect(payload.organization).toEqual({ name: "Acme" }); // no slug either
    expect(payload.data).toEqual({
      question: { text: "How was it?" },
      dashboardUrl: "https://signal.example.com/dashboard/messages/msg-1",
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain("It was great");
    expect(json).not.toContain("praise");
  });

  it("includes a followup object only when followupContent is given", () => {
    const withFollowup = buildPayload("full", samplePayloadInput({ followupContent: "thanks for the reply" }));
    expect((withFollowup.data as { followup?: { content: string } }).followup).toEqual({
      content: "thanks for the reply",
    });
    const without = buildPayload("full", samplePayloadInput());
    expect(without.data).not.toHaveProperty("followup");
  });

  it("never includes forbidden fields regardless of mode", () => {
    for (const mode of ["full", "nudge"] as const) {
      const json = JSON.stringify(buildPayload(mode, samplePayloadInput({ followupContent: "hi" })));
      for (const forbidden of [
        "replyToken",
        "authorUserId",
        "createdFor",
        "readBy",
        "embedding",
        "toxicity",
        "\"pii\"",
        "piiFlag",
      ]) {
        expect(json).not.toContain(forbidden);
      }
    }
  });
});

describe("buildSlackBody", () => {
  it("renders every user-controlled string as plain_text, never mrkdwn", () => {
    const body = buildSlackBody(
      "full",
      samplePayloadInput({
        message: {
          id: "msg-1",
          content: "<!channel> click http://evil.example",
          answerText: "",
          question: { id: "q1", text: "Feedback?" },
          team: null,
          ai: null,
        },
      })
    );
    const json = JSON.stringify(body);
    expect(json).not.toContain('"mrkdwn"');
    const blocks = (body.blocks as { text?: { type: string } }[]).filter((b) => b.text);
    for (const b of blocks) expect(b.text!.type).toBe("plain_text");
    // The literal mention text survives verbatim as inert plain text.
    expect(json).toContain("<!channel> click http://evil.example");
  });

  it("turns off link unfurling", () => {
    const body = buildSlackBody("full", samplePayloadInput());
    expect(body.unfurl_links).toBe(false);
    expect(body.unfurl_media).toBe(false);
  });

  it("nudge mode doesn't include the message content", () => {
    const body = buildSlackBody("nudge", samplePayloadInput());
    const json = JSON.stringify(body);
    expect(json).not.toContain("It was great");
  });
});

describe("sign", () => {
  it("computes v1=<hex hmac-sha256> over `${timestamp}.${body}`", () => {
    const sig = sign("my-secret", "1700000000", '{"a":1}');
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    // Recompute independently with node:crypto to confirm the exact scheme.
    const expected = `v1=${createHmac("sha256", "my-secret").update("1700000000." + '{"a":1}').digest("hex")}`;
    expect(sig).toBe(expected);
  });

  it("changes if the secret, timestamp, or body changes", () => {
    const base = sign("secret", "1", "body");
    expect(sign("other", "1", "body")).not.toBe(base);
    expect(sign("secret", "2", "body")).not.toBe(base);
    expect(sign("secret", "1", "other")).not.toBe(base);
  });
});

describe("hasActiveIntegrations", () => {
  it("false for no org id, an invalid id, or no integrations", async () => {
    expect(await hasActiveIntegrations(null)).toBe(false);
    expect(await hasActiveIntegrations("not-an-id")).toBe(false);
    const org = await makeOrg();
    expect(await hasActiveIntegrations(org._id)).toBe(false);
  });

  it("true when an enabled integration exists; false when only disabled ones do", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org);
    expect(await hasActiveIntegrations(org._id)).toBe(true);
    await IntegrationModel.updateOne({ _id: integration._id }, { enabled: false });
    expect(await hasActiveIntegrations(org._id)).toBe(false);
  });
});

async function makeGeneralMessage(org: { _id: string | mongoose.Types.ObjectId }, overrides: Record<string, unknown> = {}) {
  return MessageModel.create({
    content: "General feedback",
    createdFor: org._id, // arbitrary; not asserted on
    organizationId: org._id,
    replyToken: randomBytes(16).toString("hex"),
    ...overrides,
  });
}

describe("dispatchMessageEvent", () => {
  it("delivers to every enabled integration subscribed to the event", async () => {
    const org = await makeOrg();
    const calls: { host: string }[] = [];
    __setTestTransport(
      fakeTransport((url) => {
        calls.push({ host: url.hostname });
        return { status: 200 };
      })
    );
    await makeIntegration(org, { kind: "webhook" });
    await makeIntegration(org, { kind: "slack" });
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    expect(calls.map((c) => c.host).sort()).toEqual(["hooks.slack.com", "receiver.example.com"]);
    const integrations = await IntegrationModel.find({ organizationId: org._id });
    for (const i of integrations) {
      expect(i.lastStatus).toBe("ok");
      expect(i.lastHttpStatus).toBe(200);
      expect(i.consecutiveFailures).toBe(0);
    }
  });

  it("only delivers to integrations subscribed to that specific event", async () => {
    const org = await makeOrg();
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    await makeIntegration(org, { events: ["message.followup"] });
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(calls).toBe(0);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.followup" });
    expect(calls).toBe(1);
  });

  it("skips a member-authored message", async () => {
    const org = await makeOrg();
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    await makeIntegration(org);
    const msg = await makeGeneralMessage(org, { authorType: "member", authorUserId: new mongoose.Types.ObjectId() });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(calls).toBe(0);
  });

  it("skips a message on an internal-visibility question", async () => {
    const org = await makeOrg();
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    await makeIntegration(org);
    const q = await QuestionModel.create({
      questionText: "Internal only",
      userId: org.createdBy,
      organizationId: org._id,
      slug: "internal-only",
      visibility: "internal",
    });
    const msg = await makeGeneralMessage(org, { questionId: q._id });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(calls).toBe(0);
  });

  it("delivers a public-question message and includes the team name", async () => {
    const org = await makeOrg();
    let capturedBody = "";
    __setTestTransport(
      fakeTransport((_url, body) => {
        capturedBody = body;
        return { status: 200 };
      })
    );
    await makeIntegration(org, { kind: "webhook" });
    const team = await TeamModel.create({
      organizationId: org._id,
      name: "Support",
      slug: "support",
      createdBy: org.createdBy,
    });
    const q = await QuestionModel.create({
      questionText: "How was support?",
      userId: org.createdBy,
      organizationId: org._id,
      teamId: team._id,
      slug: "how-was-support",
    });
    const msg = await MessageModel.create({
      content: "Great help",
      createdFor: org.createdBy,
      organizationId: org._id,
      questionId: q._id,
      teamId: team._id,
      replyToken: randomBytes(16).toString("hex"),
    });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    const payload = JSON.parse(capturedBody);
    expect(payload.data.message.question).toEqual({ id: String(q._id), text: "How was support?" });
    expect(payload.data.message.team).toEqual({ name: "Support" });
  });

  it("nudge payloadMode never includes message content or answer", async () => {
    const org = await makeOrg();
    let capturedBody = "";
    __setTestTransport(
      fakeTransport((_url, body) => {
        capturedBody = body;
        return { status: 200 };
      })
    );
    await makeIntegration(org, { payloadMode: "nudge" });
    const msg = await makeGeneralMessage(org, { content: "Something very specific and private" });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(capturedBody).not.toContain("Something very specific and private");
  });

  it("includes sentiment/tags but never toxicity/pii, even if present on the message", async () => {
    const org = await makeOrg();
    let capturedBody = "";
    __setTestTransport(
      fakeTransport((_url, body) => {
        capturedBody = body;
        return { status: 200 };
      })
    );
    await makeIntegration(org);
    const msg = await makeGeneralMessage(org, {
      ai: {
        status: "done",
        attempts: 1,
        sentiment: "positive",
        tags: ["praise"],
        toxicity: 0.9,
        pii: 0.8,
        piiFlag: true,
        model: "ministral-8b-latest",
      },
    });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    const payload = JSON.parse(capturedBody);
    expect(payload.data.message.ai).toEqual({ sentiment: "positive", tags: ["praise"] });
    expect(capturedBody).not.toContain("toxicity");
    expect(capturedBody).not.toContain("piiFlag");
    expect(capturedBody).not.toMatch(/"pii"/);
  });

  it("a downgrade to FREE stops delivery entirely", async () => {
    const org = await makeOrg("PRO");
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    await makeIntegration(org);
    const msg = await makeGeneralMessage(org);
    await OrganizationModel.updateOne({ _id: org._id }, { plan: "FREE" });

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(calls).toBe(0);
  });

  it("sends the correct v1 HMAC signature and stable delivery id for a webhook", async () => {
    const org = await makeOrg();
    let seenHeaders: Record<string, string> | undefined;
    let seenBody = "";
    __setTestTransport(
      fakeTransport((_url, body, opts) => {
        seenHeaders = opts.headers;
        seenBody = body;
        return { status: 200 };
      })
    );
    await makeIntegration(org, { kind: "webhook" });
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    expect(seenHeaders!["X-SignalHQ-Event"]).toBe("message.created");
    expect(typeof seenHeaders!["X-SignalHQ-Delivery"]).toBe("string");
    const ts = seenHeaders!["X-SignalHQ-Timestamp"];
    const expectedSig = sign(WEBHOOK_SECRET, ts, seenBody);
    const a = Buffer.from(seenHeaders!["X-SignalHQ-Signature"]);
    const b = Buffer.from(expectedSig);
    expect(a.length).toBe(b.length);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it("retries once on a 500, then succeeds and resets consecutiveFailures", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org, { consecutiveFailures: 3 });
    let attempts = 0;
    __setTestTransport(
      fakeTransport(() => {
        attempts++;
        return attempts === 1 ? { status: 500 } : { status: 200 };
      })
    );
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    expect(attempts).toBe(2);
    const updated = await IntegrationModel.findById(integration._id);
    expect(updated!.lastStatus).toBe("ok");
    expect(updated!.consecutiveFailures).toBe(0);
  });

  it("retries once on a timeout/network error and gives up after the second failure", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org);
    let attempts = 0;
    __setTestTransport(
      fakeTransport(() => {
        attempts++;
        throw new Error("timeout");
      })
    );
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    expect(attempts).toBe(2);
    const updated = await IntegrationModel.findById(integration._id);
    expect(updated!.lastStatus).toBe("fail");
    expect(updated!.consecutiveFailures).toBe(1); // one failure recorded, not one per attempt
  });

  it("clears a stale lastHttpStatus when a later failure has no HTTP status of its own", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org);

    // First: a failure that does carry an HTTP status.
    __setTestTransport(fakeTransport(() => ({ status: 503 })));
    const msg1 = await makeGeneralMessage(org);
    await dispatchMessageEvent({ organizationId: org._id, messageId: msg1._id, event: "message.created" });
    const afterHttpFailure = await IntegrationModel.findById(integration._id);
    expect(afterHttpFailure!.lastHttpStatus).toBe(503);

    // Then: a network-level failure (no HTTP response at all) — the stale
    // 503 must not linger and be misreported as this attempt's status.
    __setTestTransport(
      fakeTransport(() => {
        throw new Error("ECONNREFUSED");
      })
    );
    const msg2 = await makeGeneralMessage(org);
    await dispatchMessageEvent({ organizationId: org._id, messageId: msg2._id, event: "message.created" });

    const afterNetworkFailure = await IntegrationModel.findById(integration._id);
    expect(afterNetworkFailure!.lastStatus).toBe("fail");
    expect(afterNetworkFailure!.lastHttpStatus).toBeUndefined();
  });

  it("never retries a non-retryable 4xx", async () => {
    const org = await makeOrg();
    await makeIntegration(org);
    let attempts = 0;
    __setTestTransport(
      fakeTransport(() => {
        attempts++;
        return { status: 400 };
      })
    );
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(attempts).toBe(1);
  });

  it("auto-disables at the failure threshold with a system (actor-less) audit entry", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org, { consecutiveFailures: 9 });
    __setTestTransport(fakeTransport(() => ({ status: 400 })));
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });

    const updated = await IntegrationModel.findById(integration._id);
    expect(updated!.enabled).toBe(false);
    expect(updated!.consecutiveFailures).toBe(10);
    expect(updated!.disabledReason).toBe("auto_disabled_consecutive_failures");
    const entry = await AuditLogModel.findOne({ action: "integration.auto_disabled" });
    expect(entry).not.toBeNull();
    expect(entry!.actorUserId).toBeUndefined();
    expect(entry!.metadata).toMatchObject({ host: "receiver.example.com" });
  });

  it("a disabled integration below the threshold is left alone and not delivered to again", async () => {
    const org = await makeOrg();
    await makeIntegration(org, { enabled: false, consecutiveFailures: 3 });
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    const msg = await makeGeneralMessage(org);

    await dispatchMessageEvent({ organizationId: org._id, messageId: msg._id, event: "message.created" });
    expect(calls).toBe(0);
  });

  it("a follow-up event carries the latest sender reply as `followup.content`", async () => {
    const org = await makeOrg();
    let capturedBody = "";
    __setTestTransport(
      fakeTransport((_url, body) => {
        capturedBody = body;
        return { status: 200 };
      })
    );
    await makeIntegration(org);
    const msg = await makeGeneralMessage(org, {
      replies: [{ authorRole: "sender", content: "Actually, one more thing", createdAt: new Date() }],
    });
    const followupAt = new Date("2026-02-02T00:00:00Z");

    await dispatchMessageEvent({
      organizationId: org._id,
      messageId: msg._id,
      event: "message.followup",
      followupAt,
    });

    const payload = JSON.parse(capturedBody);
    expect(payload.data.followup).toEqual({ content: "Actually, one more thing" });
    expect(payload.createdAt).toBe(followupAt.toISOString());
  });

  it("no organizationId, no integrations, or a missing message all no-op safely", async () => {
    const org = await makeOrg();
    let calls = 0;
    __setTestTransport(fakeTransport(() => (calls++, { status: 200 })));
    await expect(
      dispatchMessageEvent({ organizationId: null, messageId: new mongoose.Types.ObjectId(), event: "message.created" })
    ).resolves.toBeUndefined();
    await expect(
      dispatchMessageEvent({
        organizationId: org._id,
        messageId: new mongoose.Types.ObjectId(), // no such message
        event: "message.created",
      })
    ).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });
});

describe("sendTestEvent", () => {
  it("reports ok:true/status:'ok' on a 2xx and never touches consecutiveFailures", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org, { consecutiveFailures: 2 });
    __setTestTransport(fakeTransport(() => ({ status: 200 })));

    const result = await sendTestEvent(integration as IIntegration);
    expect(result).toEqual({ ok: true, status: "ok", httpStatus: 200 });
    expect((await IntegrationModel.findById(integration._id))!.consecutiveFailures).toBe(2);
  });

  it("reports ok:false on a failure, with no retry", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org);
    let attempts = 0;
    __setTestTransport(
      fakeTransport(() => {
        attempts++;
        return { status: 500 };
      })
    );
    const result = await sendTestEvent(integration as IIntegration);
    expect(result.ok).toBe(false);
    expect(attempts).toBe(1);
  });

  it("never throws (a thrown transport error resolves to ok:false)", async () => {
    const org = await makeOrg();
    const integration = await makeIntegration(org);
    __setTestTransport(
      fakeTransport(() => {
        throw new Error("boom");
      })
    );
    await expect(sendTestEvent(integration as IIntegration)).resolves.toMatchObject({ ok: false, status: "fail" });
  });
});
