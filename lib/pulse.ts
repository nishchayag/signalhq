// Recurring "pulse" question rounds (Phase 4b). Mongoose-free and
// server-free — the models, zod schemas, route handlers and (eventually)
// client components all share one definition, same as lib/answers.ts.
//
// A pulse question has no gaps between rounds: round `n` runs from its
// `startsAt` (inclusive) to the next round's `startsAt` (exclusive), for
// every `n >= 0`. Before the very first round (`n < 0`) the question is
// "scheduled" — not yet accepting responses. All boundaries are computed in
// calendar-day arithmetic on the anchor's local "YYYY-MM-DD", then converted
// to an instant with lib/zonedDate.ts#zonedMidnight, so a DST shift changes
// only the UTC instant of a boundary, never which calendar day it falls on.
import { addDaysYmd, localYmd, zonedMidnight } from "@/lib/zonedDate";

export const PULSE_CADENCES = ["weekly", "biweekly", "monthly"] as const;
export type PulseCadence = (typeof PULSE_CADENCES)[number];

/** The fields `roundAt` needs. `remind` is carried along for `pulseSummary`
 * but ignored by the round math itself. */
export interface QuestionPulseLike {
  cadence: PulseCadence;
  /** "YYYY-MM-DD", interpreted as local midnight in `timeZone`. */
  anchorDate: string;
  /** IANA zone name (already resolved/canonicalised at write time). */
  timeZone: string;
  remind?: boolean;
}

export interface Round {
  /** Which round `now` falls in. Negative ⇒ before the first round
   * (the question hasn't opened yet — see lib/answers.ts#questionState's
   * "scheduled" reason). */
  index: number;
  /** Inclusive start of this round, as a UTC instant. */
  startsAt: Date;
  /** Exclusive end of this round (= the next round's `startsAt`). */
  endsAt: Date;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** `ymd` shifted by `months` calendar months (may be negative), clamping the
 * day of month to the target month's last day (so an anchor on the 31st
 * lands on Feb 28/29, Apr/Jun/Sep/Nov 30, etc.). */
function addMonthsClampedYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const targetY = Math.floor(total / 12);
  const targetM0 = ((total % 12) + 12) % 12;
  const day = Math.min(d, daysInMonth(targetY, targetM0));
  return `${targetY}-${String(targetM0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Calendar months between two "YYYY-MM-DD" strings (day ignored) — a
 * starting estimate for the monthly round index, corrected below. */
function monthsBetweenYmd(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Epoch day number (UTC calendar day) of a "YYYY-MM-DD" string — for exact
 * day-count arithmetic (weekly/biweekly), never subject to clamping. */
function epochDayYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Which round of a pulse question `now` falls in, plus that round's
 * boundaries. Weekly/biweekly use exact day-count division (always safe);
 * monthly starts from a calendar-month estimate and self-corrects with the
 * clamped month math, converging in at most a couple of steps.
 */
export function roundAt(pulse: QuestionPulseLike, now: Date = new Date()): Round {
  const tz = pulse.timeZone;
  const nowYmd = localYmd(now, tz);

  if (pulse.cadence === "monthly") {
    let index = monthsBetweenYmd(pulse.anchorDate, nowYmd);
    let startYmd = addMonthsClampedYmd(pulse.anchorDate, index);
    let startsAt = zonedMidnight(startYmd, tz);
    while (startsAt.getTime() > now.getTime()) {
      index -= 1;
      startYmd = addMonthsClampedYmd(pulse.anchorDate, index);
      startsAt = zonedMidnight(startYmd, tz);
    }
    let nextYmd = addMonthsClampedYmd(pulse.anchorDate, index + 1);
    let endsAt = zonedMidnight(nextYmd, tz);
    while (endsAt.getTime() <= now.getTime()) {
      index += 1;
      startsAt = endsAt;
      nextYmd = addMonthsClampedYmd(pulse.anchorDate, index + 1);
      endsAt = zonedMidnight(nextYmd, tz);
    }
    return { index, startsAt, endsAt };
  }

  const periodDays = pulse.cadence === "weekly" ? 7 : 14;
  const dayDiff = epochDayYmd(nowYmd) - epochDayYmd(pulse.anchorDate);
  const index = Math.floor(dayDiff / periodDays);
  const startYmd = addDaysYmd(pulse.anchorDate, index * periodDays);
  const nextYmd = addDaysYmd(pulse.anchorDate, (index + 1) * periodDays);
  return { index, startsAt: zonedMidnight(startYmd, tz), endsAt: zonedMidnight(nextYmd, tz) };
}

/** When the round after the current one begins — the anchor's own start
 * when the question hasn't opened yet ("Opens on …"), otherwise the next
 * round's start ("next round opens …"). Always `roundAt(...).endsAt`: a
 * pulse question has no gaps, so "the end of the current round" and "the
 * start of the next one" are the same instant either way. */
export function nextRoundStartsAt(pulse: QuestionPulseLike, now: Date = new Date()): Date {
  return roundAt(pulse, now).endsAt;
}

/** A human label for a round index, 1-based for display. Negative (not yet
 * started) has no round number. */
export function roundLabel(index: number): string {
  return index < 0 ? "Not started yet" : `Round ${index + 1}`;
}

/** Client-facing view of a question's pulse config plus the computed round
 * state — what the dashboard and public form need (current round, when the
 * next one opens), without the internal reminder bookkeeping
 * (`lastRemindedRound`/`lastRemindedAt`). */
export interface PulseSummary {
  cadence: PulseCadence;
  anchorDate: string;
  timeZone: string;
  remind: boolean;
  round: number;
  roundLabel: string;
  nextRoundStartsAt: string;
}

export function pulseSummary(pulse: QuestionPulseLike, now: Date = new Date()): PulseSummary {
  const { index, endsAt } = roundAt(pulse, now);
  return {
    cadence: pulse.cadence,
    anchorDate: pulse.anchorDate,
    timeZone: pulse.timeZone,
    remind: pulse.remind !== false,
    round: index,
    roundLabel: roundLabel(index),
    nextRoundStartsAt: endsAt.toISOString(),
  };
}
