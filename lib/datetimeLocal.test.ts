import { describe, expect, it } from "vitest";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/datetimeLocal";

describe("datetime-local conversion", () => {
  it("round-trips a local wall-clock value", () => {
    const local = "2026-10-05T14:30";
    const iso = fromDatetimeLocalValue(local);
    expect(toDatetimeLocalValue(iso)).toBe(local);
  });

  it("empty or unparsable input yields an empty string", () => {
    expect(toDatetimeLocalValue(null)).toBe("");
    expect(toDatetimeLocalValue(undefined)).toBe("");
    expect(toDatetimeLocalValue("not-a-date")).toBe("");
  });

  it("produces a real ISO string with an explicit offset", () => {
    const iso = fromDatetimeLocalValue("2026-01-01T00:00");
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
    expect(iso.endsWith("Z")).toBe(true);
  });
});
