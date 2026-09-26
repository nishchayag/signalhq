import { describe, expect, it } from "vitest";
import { nextRoundStartsAt, pulseSummary, roundAt, roundLabel } from "@/lib/pulse";

describe("roundAt: weekly", () => {
  const pulse = { cadence: "weekly" as const, anchorDate: "2026-09-01", timeZone: "UTC" };

  it("round 0 starts exactly at the anchor", () => {
    const r = roundAt(pulse, new Date("2026-09-01T00:00:00.000Z"));
    expect(r.index).toBe(0);
    expect(r.startsAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("one instant before round 0 is 'scheduled' (negative index)", () => {
    const r = roundAt(pulse, new Date("2026-08-31T23:59:59.999Z"));
    expect(r.index).toBe(-1);
    expect(r.endsAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("advances by exactly one week per round", () => {
    expect(roundAt(pulse, new Date("2026-09-10T00:00:00.000Z")).index).toBe(1);
    expect(roundAt(pulse, new Date("2026-09-22T00:00:00.000Z")).index).toBe(3);
  });

  it("a submit exactly on the round boundary lands in the new round", () => {
    // 2026-09-08T00:00:00Z is round 1's start.
    const justBefore = roundAt(pulse, new Date("2026-09-07T23:59:59.999Z"));
    const exactly = roundAt(pulse, new Date("2026-09-08T00:00:00.000Z"));
    expect(justBefore.index).toBe(0);
    expect(exactly.index).toBe(1);
  });
});

describe("roundAt: biweekly", () => {
  const pulse = { cadence: "biweekly" as const, anchorDate: "2026-01-01", timeZone: "UTC" };

  it("advances by 14 days per round", () => {
    expect(roundAt(pulse, new Date("2026-01-01T00:00:00.000Z")).index).toBe(0);
    expect(roundAt(pulse, new Date("2026-01-14T23:59:59.000Z")).index).toBe(0);
    expect(roundAt(pulse, new Date("2026-01-15T00:00:00.000Z")).index).toBe(1);
    expect(roundAt(pulse, new Date("2026-01-29T00:00:00.000Z")).index).toBe(2);
  });
});

describe("roundAt: monthly", () => {
  it("advances by one calendar month, same day of month", () => {
    const pulse = { cadence: "monthly" as const, anchorDate: "2026-01-15", timeZone: "UTC" };
    expect(roundAt(pulse, new Date("2026-01-15T00:00:00.000Z")).index).toBe(0);
    expect(roundAt(pulse, new Date("2026-02-14T23:59:00.000Z")).index).toBe(0);
    expect(roundAt(pulse, new Date("2026-02-15T00:00:00.000Z")).index).toBe(1);
    expect(roundAt(pulse, new Date("2026-03-15T00:00:00.000Z")).index).toBe(2);
  });

  it("clamps an anchor on the 31st to shorter months (Feb) and restores it in longer ones", () => {
    const pulse = { cadence: "monthly" as const, anchorDate: "2026-01-31", timeZone: "UTC" };
    // Round 0: Jan 31 -> Feb 28 (2026 isn't a leap year).
    const r0 = roundAt(pulse, new Date("2026-02-01T00:00:00.000Z"));
    expect(r0.index).toBe(0);
    expect(r0.endsAt.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    // Round 1: Feb 28 -> Mar 31 (restored, since March has 31 days).
    const r1 = roundAt(pulse, new Date("2026-03-01T00:00:00.000Z"));
    expect(r1.index).toBe(1);
    expect(r1.startsAt.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(r1.endsAt.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    // Round 2: Mar 31 -> Apr 30 (April has 30 days).
    const r2 = roundAt(pulse, new Date("2026-04-01T00:00:00.000Z"));
    expect(r2.index).toBe(2);
    expect(r2.endsAt.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("clamps across a leap-year February", () => {
    const pulse = { cadence: "monthly" as const, anchorDate: "2027-12-31", timeZone: "UTC" };
    // 2028 is a leap year: Dec 31 2027 + 2 months -> Feb 29 2028.
    const r = roundAt(pulse, new Date("2028-02-29T00:00:00.000Z"));
    expect(r.index).toBe(2);
    expect(r.startsAt.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("roundAt: DST safety", () => {
  it("America/New_York weekly round crossing the March spring-forward", () => {
    // US DST starts 2026-03-08. An anchor on 2026-03-01 (Sunday) means
    // round 1 starts 2026-03-08 local — the DST-transition day itself.
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-03-01",
      timeZone: "America/New_York",
    };
    const r1 = roundAt(pulse, new Date("2026-03-08T12:00:00.000Z"));
    expect(r1.index).toBe(1);
    // Local midnight of 2026-03-08 in New York, pre-DST-shift for that
    // calendar day, is still UTC-5 (the shift happens at 2am local).
    expect(r1.startsAt.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("America/New_York weekly round crossing the November fall-back", () => {
    // US DST ends 2026-11-01.
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-10-25",
      timeZone: "America/New_York",
    };
    const r1 = roundAt(pulse, new Date("2026-11-01T12:00:00.000Z"));
    expect(r1.index).toBe(1);
    expect(r1.startsAt.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("Europe/Berlin monthly round crossing the March/October DST changes", () => {
    const pulse = {
      cadence: "monthly" as const,
      anchorDate: "2026-02-01",
      timeZone: "Europe/Berlin",
    };
    // Before the EU spring-forward (2026-03-29): UTC+1.
    const r1 = roundAt(pulse, new Date("2026-03-05T00:00:00.000Z"));
    expect(r1.index).toBe(1);
    expect(r1.startsAt.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    // After it (round starting April 1st): UTC+2.
    const r2 = roundAt(pulse, new Date("2026-04-05T00:00:00.000Z"));
    expect(r2.index).toBe(2);
    expect(r2.startsAt.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  it("America/Santiago: a round anchored on a day with no local midnight doesn't crash", () => {
    // Chile's 2026 spring-forward skips local 00:00-00:59 on 2026-09-06.
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-09-06",
      timeZone: "America/Santiago",
    };
    expect(() => roundAt(pulse, new Date("2026-09-10T00:00:00.000Z"))).not.toThrow();
    const r = roundAt(pulse, new Date("2026-09-10T00:00:00.000Z"));
    expect(r.index).toBe(0);
    expect(r.endsAt.getTime()).toBeGreaterThan(r.startsAt.getTime());
  });

  it("Pacific/Kiritimati (UTC+14): round boundaries land on the right side of the date line", () => {
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-09-06",
      timeZone: "Pacific/Kiritimati",
    };
    const r0 = roundAt(pulse, new Date("2026-09-06T00:00:00.000Z"));
    // Local midnight of 2026-09-06 in Kiritimati is 2026-09-05T10:00:00Z.
    expect(r0.startsAt.toISOString()).toBe("2026-09-05T10:00:00.000Z");
    expect(r0.index).toBe(0);
  });

  it("Pacific/Pago_Pago (UTC-11): round boundaries land on the right side of the date line", () => {
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-09-06",
      timeZone: "Pacific/Pago_Pago",
    };
    const r0 = roundAt(pulse, new Date("2026-09-06T12:00:00.000Z"));
    expect(r0.startsAt.toISOString()).toBe("2026-09-06T11:00:00.000Z");
    expect(r0.index).toBe(0);
  });
});

describe("nextRoundStartsAt", () => {
  it("equals the current round's end, both before and after opening", () => {
    const pulse = { cadence: "weekly" as const, anchorDate: "2026-09-01", timeZone: "UTC" };
    expect(nextRoundStartsAt(pulse, new Date("2026-08-25T00:00:00.000Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
    expect(nextRoundStartsAt(pulse, new Date("2026-09-03T00:00:00.000Z")).toISOString()).toBe(
      "2026-09-08T00:00:00.000Z"
    );
  });
});

describe("roundLabel", () => {
  it("is 1-based, and blank before the first round", () => {
    expect(roundLabel(-1)).toBe("Not started yet");
    expect(roundLabel(0)).toBe("Round 1");
    expect(roundLabel(4)).toBe("Round 5");
  });
});

describe("pulseSummary", () => {
  it("carries the schedule plus the computed round state", () => {
    const pulse = {
      cadence: "weekly" as const,
      anchorDate: "2026-09-01",
      timeZone: "UTC",
      remind: false,
    };
    const s = pulseSummary(pulse, new Date("2026-09-10T00:00:00.000Z"));
    expect(s).toMatchObject({
      cadence: "weekly",
      anchorDate: "2026-09-01",
      timeZone: "UTC",
      remind: false,
      round: 1,
      roundLabel: "Round 2",
      nextRoundStartsAt: "2026-09-15T00:00:00.000Z",
    });
  });

  it("remind defaults to true when absent", () => {
    const pulse = { cadence: "weekly" as const, anchorDate: "2026-09-01", timeZone: "UTC" };
    expect(pulseSummary(pulse, new Date("2026-09-01T00:00:00.000Z")).remind).toBe(true);
  });
});
