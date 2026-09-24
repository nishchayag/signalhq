import { createHash } from "crypto";
import MessageModel from "@/models/message.model";
import type { ThreadSource } from "@/lib/thread";

// The only fields a replyToken holder (the anonymous sender) may ever read.
// Never "+ai", never the embedding, never ids/org/recipient.
export const RECEIPT_FIELDS = "content createdAt reply replies authorType awaitingOrg";

export type Receipt = ThreadSource & { awaitingOrg?: boolean };

/**
 * The anonymous message behind a replyToken, or null — for unknown tokens
 * AND for member threads (which have no sender-facing receipt), so the two
 * are indistinguishable to the caller.
 */
export async function loadReceipt(replyToken: string): Promise<Receipt | null> {
  if (typeof replyToken !== "string" || replyToken.length === 0 || replyToken.length > 200) {
    return null;
  }
  const msg = await MessageModel.findOne({ replyToken }).select(RECEIPT_FIELDS).lean<Receipt>();
  if (!msg || msg.authorType === "member") return null;
  return msg;
}

/** Longest a thread may get (the first message counts as a turn). */
export const MAX_THREAD_TURNS = 50;

/** Rate-limit key part for a replyToken — never the raw token. */
export function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}
