import type { IMessage } from "@/models/message.model";

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

const HEADER = ["Content", "Submitted At", "Reply", "Replied At"];

/** Flattens messages to CSV: content/timestamp plus the single reply, if any.
 * Member-authored internal-question threads are never passed in here (see
 * the export route's filter), so multi-turn `replies` are out of scope. */
export function messagesToCsv(messages: IMessage[]): string {
  const rows = messages.map((m) => [
    m.content,
    m.createdAt.toISOString(),
    m.reply?.content ?? "",
    m.reply?.repliedAt ? new Date(m.reply.repliedAt).toISOString() : "",
  ]);
  return [HEADER, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(String(cell))).join(","))
    .join("\n");
}
