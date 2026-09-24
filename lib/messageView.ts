import type { MembershipRole } from "@/models/membership.model";
import type { AiSentiment, AiTag, IMessage } from "@/models/message.model";
import { can } from "@/lib/permissions";

/**
 * The AI fields a client may see on a message. Every member of the org
 * gets sentiment + tags; toxicity/PII need `ai:viewSafety` (OWNER/ADMIN).
 * Absent when the message isn't enriched yet (or AI is off).
 */
export interface MessageAiView {
  sentiment?: AiSentiment;
  tags?: AiTag[];
  toxicity?: number;
  pii?: number;
  piiFlag?: boolean;
}

/** A message as dashboard routes return it (see withAiView). */
export type MessageView = Omit<IMessage, "ai" | "embedding" | "embeddingModel"> & {
  ai?: MessageAiView;
};

type Plain = Record<string, unknown>;

function toPlain(doc: unknown): Plain {
  if (doc && typeof (doc as { toObject?: unknown }).toObject === "function") {
    return (doc as { toObject: () => Plain }).toObject();
  }
  return { ...(doc as Plain) };
}

function aiView(ai: unknown, canViewSafety: boolean): MessageAiView | undefined {
  if (!ai || typeof ai !== "object") return undefined;
  const src = ai as Plain;
  const out: MessageAiView = {};
  if (typeof src.sentiment === "string") out.sentiment = src.sentiment as AiSentiment;
  if (Array.isArray(src.tags) && src.tags.length > 0) out.tags = [...src.tags] as AiTag[];
  if (canViewSafety) {
    if (typeof src.toxicity === "number") out.toxicity = src.toxicity;
    if (typeof src.pii === "number") out.pii = src.pii;
    if (typeof src.piiFlag === "boolean") out.piiFlag = src.piiFlag;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Turn Message docs (hydrated or lean) into plain objects safe to return to
 * `role`. Always drops the embedding and the enrichment bookkeeping
 * (status/attempts/lock/model); a MEMBER sees only sentiment + tags.
 * `memberThread: true` — a member's private thread viewed by its own
 * author — drops `ai` entirely: nobody is shown how their own words were
 * classified.
 */
export function withAiView<T = MessageView>(
  docs: unknown[],
  role: MembershipRole | null | undefined,
  { memberThread = false }: { memberThread?: boolean } = {}
): T[] {
  const canViewSafety = can(role, "ai:viewSafety");
  return docs.map((doc) => {
    const plain = toPlain(doc);
    const { ai, embedding, embeddingModel, ...rest } = plain;
    void embedding;
    void embeddingModel;
    const view = memberThread ? undefined : aiView(ai, canViewSafety);
    return (view ? { ...rest, ai: view } : rest) as T;
  });
}

/** Single-doc convenience; passes null through. */
export function withAiViewOne<T = MessageView>(
  doc: unknown,
  role: MembershipRole | null | undefined,
  opts?: { memberThread?: boolean }
): T | null {
  if (!doc) return null;
  return withAiView<T>([doc], role, opts)[0];
}
