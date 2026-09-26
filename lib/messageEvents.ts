import mongoose from "mongoose";
import { isAiEnabled } from "@/lib/ai";
import { enrichMessage } from "@/lib/aiEnrichment";
import { dispatchMessageEvent, hasActiveIntegrations, type MessageEventType } from "@/lib/webhooks";

type Id = string | mongoose.Types.ObjectId;

// Replaces the submit routes' separate `runAfter(() => enrichMessage(id))`
// call with one background task that enriches (when applicable) and then
// dispatches to the org's integrations, so a Slack/webhook delivery carries
// AI tags when they're ready in time, and `ai: null` otherwise.
//
// Orgs with no integrations behave exactly as before: enrichMessage still
// runs the same way (no deadline — it already isn't on the response's
// critical path, since this whole function only ever runs inside
// runAfter), and dispatchMessageEvent no-ops after one cheap
// `{organizationId, enabled: true}` query.
const DISPATCH_ENRICH_DEADLINE_MS = 12_000;

export async function afterMessageCreated({
  organizationId,
  messageId,
  event,
}: {
  organizationId: Id | null | undefined;
  messageId: Id;
  event: MessageEventType;
}): Promise<void> {
  const hasIntegrations = await hasActiveIntegrations(organizationId);
  if (isAiEnabled()) {
    if (hasIntegrations) {
      await enrichMessage(messageId, { deadline: Date.now() + DISPATCH_ENRICH_DEADLINE_MS });
    } else {
      await enrichMessage(messageId);
    }
  }
  await dispatchMessageEvent({ organizationId, messageId, event });
}
