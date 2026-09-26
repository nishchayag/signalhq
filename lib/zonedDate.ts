// DB-free timezone/calendar-day helpers. Originally lived in
// lib/responseStats.ts (which re-exports them for backward compatibility);
// split out so pure client/server code that needs calendar-day math — e.g.
// lib/pulse.ts's recurring-round calculations — never has to import a
// Mongoose-backed module to get it.

/**
 * Canonical IANA zone name, or null if Intl doesn't know it. The canonical
 * form matters: Mongo's `timezone` is case-sensitive ("utc" is an error,
 * "UTC" isn't), and ICU canonicalises to the long-standing link names
 * ("Asia/Kolkata" → "Asia/Calcutta", "Europe/Kyiv" → "Europe/Kiev"), which
 * Mongo's tzdata also knows (measured on MongoDB 8.2). Offsets like "+05:30"
 * pass through and Mongo accepts them too.
 */
export function resolveTimeZone(tz: string | null | undefined): string | null {
  if (tz == null || tz === "") return "UTC";
  if (tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
/** The local calendar date of `d` in `tz`, "YYYY-MM-DD". */
export function localYmd(d: Date, tz: string): string {
  let f = ymdFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** tz's UTC offset (ms) at `instant`. */
function tzOffsetMs(instant: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant local midnight of `ymd` occurs in `tz`. When `tz` skips
 * midnight on that date entirely (a DST spring-forward that lands exactly on
 * 00:00, e.g. America/Santiago), there is no instant that reads as `ymd`'s
 * 00:00 in `tz`, so this resolves to whichever side of the gap the
 * `guess - offset` arithmetic lands on — which can be the *previous*
 * calendar day's 23:00, not `ymd`'s. Measured: for America/Santiago on
 * 2026-09-06 (that DST transition), `zonedMidnight("2026-09-06", ...)`
 * returns an instant that's 2026-09-05T23:00 local. Callers needing the
 * result to land on `ymd`'s calendar day specifically (rather than just "a
 * consistent, monotonic boundary") must not rely on this function on such a
 * date.
 */
export function zonedMidnight(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off = tzOffsetMs(guess, tz);
  let t = guess - off;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}

/** `ymd` shifted by `days` calendar days (may be negative), UTC calendar math. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday on or before `ymd`'s week (UTC calendar math on the ymd itself,
 * not a zoned instant). */
export function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysYmd(ymd, -((dow + 6) % 7));
}
