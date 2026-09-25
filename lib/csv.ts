import { threadOf, type ThreadSource, type ThreadTurn } from "@/lib/thread";
import { formatAnswer } from "@/lib/answers";

// Leading =/+/-/@ makes spreadsheet apps (Excel, Sheets) interpret the cell
// as a formula on open. `content` here can originate from an unauthenticated
// public feedback submission, so a neutralizing prefix is required, not just
// defense-in-depth — this is the standard OWASP CSV-injection mitigation.
const FORMULA_TRIGGER = /^[=+\-@]/;

/** Quotes a field if it contains a comma, quote, or newline; doubles any quotes
 * inside; and neutralizes a leading formula-trigger character. */
export function escapeCsvField(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

const HEADER = ["Content", "Submitted At", "Replies", "Last Reply At"];
// Typed questions: the structured answer, its numeric score (rating/NPS;
// blank for choices), and the optional comment in place of "Content".
const TYPED_HEADER = ["Answer", "Score", "Comment", "Submitted At", "Replies", "Last Reply At"];

const ROLE_LABEL: Record<ThreadTurn["authorRole"], string> = {
  org: "Org",
  sender: "Sender",
  member: "Member",
};

/** Neutralizes a formula trigger at the start of one line/turn. */
function neutralize(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}

/** Everything after the first turn, one `Org (ISO): text` entry per turn.
 * Each turn's own text is neutralized too — the cell as a whole starts with
 * the role label, but a spreadsheet splitting on newlines would otherwise
 * see a turn beginning with "=". */
export function serializeReplies(turns: ThreadTurn[]): string {
  return turns
    .map((t) => {
      const lines = t.content.split("\n").map(neutralize).join("\n");
      return `${ROLE_LABEL[t.authorRole]} (${t.createdAt.toISOString()}): ${neutralize(lines)}`;
    })
    .join("\n");
}

/** Flattens messages to CSV: content/timestamp plus the thread after it.
 * Member-authored internal-question threads are never passed in here (see
 * the export route's filter). */
export function messagesToCsv(
  messages: ThreadSource[],
  { typed = false }: { typed?: boolean } = {}
): string {
  const rows = messages.map((m) => {
    const replies = threadOf(m).slice(1);
    const last = replies[replies.length - 1];
    const tail = [
      new Date(m.createdAt).toISOString(),
      serializeReplies(replies),
      last ? last.createdAt.toISOString() : "",
    ];
    if (!typed) return [m.content, ...tail];
    const score = m.answer?.score;
    return [
      formatAnswer(m.answer),
      typeof score === "number" ? String(score) : "",
      m.content ?? "",
      ...tail,
    ];
  });
  // Every cell, header included, goes through escapeCsvField — option labels
  // are org-authored and the comment is anonymous input.
  return [typed ? TYPED_HEADER : HEADER, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(String(cell))).join(","))
    .join("\n");
}
