import type { ThreadEntryAuthorRole } from "@/models/message.model";

/** One turn of a message thread, oldest first. */
export interface ThreadTurn {
  authorRole: ThreadEntryAuthorRole;
  content: string;
  createdAt: Date;
}

/** The fields threadOf reads — works on hydrated docs and lean objects. */
export interface ThreadSource {
  content: string;
  createdAt: Date | string;
  authorType?: string | null;
  replies?: { authorRole: string; content: string; createdAt: Date | string }[] | null;
}

/**
 * A message's whole conversation as ordered turns. Turn 1 is the message
 * itself — "member" for a member's private thread, "sender" for anonymous
 * feedback. Then `replies[]`, sorted by time (stable, so equal timestamps keep stored order). Pure.
 */
export function threadOf(msg: ThreadSource): ThreadTurn[] {
  const first: ThreadTurn = {
    authorRole: msg.authorType === "member" ? "member" : "sender",
    content: msg.content,
    createdAt: new Date(msg.createdAt),
  };
  const rest: ThreadTurn[] = (msg.replies ?? []).map((r) => ({
    authorRole: r.authorRole as ThreadEntryAuthorRole,
    content: r.content,
    createdAt: new Date(r.createdAt),
  }));

  rest.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return [first, ...rest];
}

/** The newest org turn, if any (dashboard previews). */
export function lastOrgTurn(msg: ThreadSource): ThreadTurn | null {
  const turns = threadOf(msg);
  for (let i = turns.length - 1; i > 0; i--) {
    if (turns[i].authorRole === "org") return turns[i];
  }
  return null;
}

/** The most recent turn after the first, if any — unlike lastOrgTurn, this
 * also surfaces a sender's own follow-up so a dashboard card can preview
 * "They replied: …" while awaiting an org reply. Null when nothing has been
 * added since the message was created. */
export function lastTurn(msg: ThreadSource): ThreadTurn | null {
  const turns = threadOf(msg);
  return turns.length > 1 ? turns[turns.length - 1] : null;
}
