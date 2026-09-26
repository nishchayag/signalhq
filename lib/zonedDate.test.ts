import { describe, expect, it } from "vitest";
import { addDaysYmd, localYmd, mondayOf, resolveTimeZone, zonedMidnight } from "@/lib/zonedDate";

describe("resolveTimeZone", () => {
  it("defaults missing/empty to UTC", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
  });
  it("canonicalises link names", () => {
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Calcutta");
  });
  it("rejects unknown zones and oversized input", () => {
    expect(resolveTimeZone("Not/AZone")).toBeNull();
    expect(resolveTimeZone("a".repeat(65))).toBeNull();
  });
  it("passes through a valid IANA zone unchanged", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });
});

describe("localYmd", () => {
  it("reads the local calendar date in the given zone", () => {
    // 2026-01-01T04:30:00Z is still Dec 31 in America/New_York (UTC-5).
    const d = new Date("2026-01-01T04:30:00Z");
    expect(localYmd(d, "UTC")).toBe("2026-01-01");
    expect(localYmd(d, "America/New_York")).toBe("2025-12-31");
  });
});

describe("addDaysYmd", () => {
  it("adds and subtracts calendar days across month/year boundaries", () => {
    expect(addDaysYmd("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysYmd("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysYmd("2026-09-15", 10)).toBe("2026-09-25");
  });
});

describe("mondayOf", () => {
  it("finds the Monday on or before a given date", () => {
    // 2026-09-25 is a Friday.
    expect(mondayOf("2026-09-25")).toBe("2026-09-21");
    // 2026-09-21 is itself a Monday.
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
    // 2026-09-20 is a Sunday.
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
  });
});

describe("zonedMidnight", () => {
  it("UTC midnight is the plain UTC instant", () => {
    expect(zonedMidnight("2026-09-25", "UTC").toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("matches a fixed offset zone", () => {
    // IST is UTC+5:30, so local midnight is 18:30 UTC the previous day.
    expect(zonedMidnight("2026-09-25", "Asia/Calcutta").toISOString()).toBe(
      "2026-09-24T18:30:00.000Z"
    );
  });

  it("America/New_York: standard time (Nov) offset is UTC-5", () => {
    expect(zonedMidnight("2026-11-15", "America/New_York").toISOString()).toBe(
      "2026-11-15T05:00:00.000Z"
    );
  });

  it("America/New_York: DST (Mar) offset is UTC-4 after the spring-forward", () => {
    // DST starts 2026-03-08 in the US.
    expect(zonedMidnight("2026-03-15", "America/New_York").toISOString()).toBe(
      "2026-03-15T04:00:00.000Z"
    );
  });

  it("Europe/Berlin: DST (Mar/Oct) offset shifts from +1 to +2", () => {
    // Before the EU spring-forward (2026-03-29): UTC+1.
    expect(zonedMidnight("2026-03-01", "Europe/Berlin").toISOString()).toBe(
      "2026-02-28T23:00:00.000Z"
    );
    // After it: UTC+2.
    expect(zonedMidnight("2026-06-01", "Europe/Berlin").toISOString()).toBe(
      "2026-05-31T22:00:00.000Z"
    );
  });

  it("America/Santiago: doesn't throw when the local midnight is skipped by DST", () => {
    // Chile's 2026 spring-forward is 2026-09-06 00:00 -> 01:00 local, so
    // "2026-09-06" has no local midnight instant at all. The one-step
    // correction resolves to the nearest instant it can compute (measured:
    // 03:00Z, an hour into 09-05 by wall clock) rather than throwing or
    // hanging — callers needing round-accurate boundaries on a skipped day
    // are covered by lib/pulse.ts's own DST tests instead.
    const t = zonedMidnight("2026-09-06", "America/Santiago");
    expect(t.toISOString()).toBe("2026-09-06T03:00:00.000Z");
  });

  it("Pacific/Kiritimati (UTC+14, the world's easternmost zone)", () => {
    expect(zonedMidnight("2026-09-06", "Pacific/Kiritimati").toISOString()).toBe(
      "2026-09-05T10:00:00.000Z"
    );
  });

  it("Pacific/Pago_Pago (UTC-11, the world's westernmost zone)", () => {
    expect(zonedMidnight("2026-09-06", "Pacific/Pago_Pago").toISOString()).toBe(
      "2026-09-06T11:00:00.000Z"
    );
  });
});
