/**
 * Convert an ISO datetime string to the value a `datetime-local` input
 * expects ("YYYY-MM-DDTHH:mm"), in the browser's local timezone. "" for
 * anything missing or unparsable, so the input shows empty rather than
 * "Invalid Date".
 */
export function toDatetimeLocalValue(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/**
 * Convert a `datetime-local` input's value (local wall-clock time, no
 * offset) to an ISO string with an explicit offset/Z, as the `closesAt`
 * schema requires (the server never guesses a timezone).
 */
export function fromDatetimeLocalValue(local: string): string {
  return new Date(local).toISOString();
}
