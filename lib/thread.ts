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
  reply?: { content?: string | null; repliedAt?: Date | string | null } | null;
  replies?: { authorRole: string; content: string; createdAt: Date | string }[] | null;
}

function sameTurn(a: ThreadTurn, b: ThreadTurn): boolean {
  return (
    a.authorRole === b.authorRole &&
    a.content === b.content &&
    a.createdAt.getTime() === b.createdAt.getTime()
  );
}

/**
 * A message's whole conversation as ordered turns. Turn 1 is the message
 * itself — "member" for a member's private thread, "sender" for anonymous
 * feedback. Then the legacy single `reply` (as an org turn, unless the
 * migration already copied it into `replies`), then `replies[]`, all sorted
 * by time (stable, so equal timestamps keep stored order). Pure.
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

  // Legacy shim (removed with `reply` in C16).
  if (msg.reply?.content && msg.reply.repliedAt) {
    const legacy: ThreadTurn = {
      authorRole: "org",
      content: msg.reply.content,
      createdAt: new Date(msg.reply.repliedAt),
    };
    if (!rest.some((t) => sameTurn(t, legacy))) rest.push(legacy);
  }

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
