import { describe, expect, it } from "vitest";
import {
  barPath,
  bucketLabel,
  clamp01,
  formatCompactNumber,
  formatPercent,
  linearScale,
  niceTicks,
  npsSegments,
  safeRatio,
  stackedMax,
} from "@/lib/chartMath";

describe("clamp01", () => {
  it("clamps to 0..1", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
  });
});

describe("safeRatio", () => {
  it("is 0 when the denominator is 0", () => {
    expect(safeRatio(5, 0)).toBe(0);
    expect(safeRatio(1, 4)).toBe(0.25);
  });
});

describe("niceTicks", () => {
  it("returns a flat [0] axis for no/zero data", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });
  it("snaps to a clean step and covers the max", () => {
    const ticks = niceTicks(9, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(9);
    // every step is equal
    const step = ticks[1] - ticks[0];
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step);
    }
  });
  it("picks round steps for a large max (thousands)", () => {
    const ticks = niceTicks(4300, 4);
    const step = ticks[1] - ticks[0];
    expect([500, 1000, 2000, 5000]).toContain(step);
  });
});

describe("formatCompactNumber", () => {
  it("formats each magnitude band", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(284)).toBe("284");
    expect(formatCompactNumber(1284)).toBe("1.3K");
    expect(formatCompactNumber(12_900)).toBe("12.9K");
    expect(formatCompactNumber(4_200_000)).toBe("4.2M");
    expect(formatCompactNumber(-1500)).toBe("-1.5K");
  });
  it("drops a trailing .0", () => {
    expect(formatCompactNumber(2000)).toBe("2K");
  });
});

describe("formatPercent", () => {
  it("rounds to the nearest integer percent", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.999)).toBe("100%");
    expect(formatPercent(1.4)).toBe("100%"); // clamped
  });
});

describe("bucketLabel", () => {
  it("formats a day bucket without shifting across a timezone", () => {
    expect(bucketLabel("2026-09-01")).toBe("Sep 1");
    expect(bucketLabel("2026-01-31")).toBe("Jan 31");
  });
  it("prefixes a week bucket", () => {
    expect(bucketLabel("2026-09-01", "week")).toBe("Wk of Sep 1");
  });
  it("returns the raw key if it doesn't parse", () => {
    expect(bucketLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("npsSegments", () => {
  it("is all-zero for no responses", () => {
    expect(npsSegments(0, 0, 0)).toEqual({ promoterPct: 0, passivePct: 0, detractorPct: 0 });
  });
  it("computes proportional widths that sum to 1", () => {
    const s = npsSegments(6, 3, 1);
    expect(s.promoterPct).toBeCloseTo(0.6);
    expect(s.passivePct).toBeCloseTo(0.3);
    expect(s.detractorPct).toBeCloseTo(0.1);
    expect(s.promoterPct + s.passivePct + s.detractorPct).toBeCloseTo(1);
  });
});

describe("linearScale", () => {
  it("interpolates within the range", () => {
    expect(linearScale(5, [0, 10], [0, 100])).toBe(50);
    expect(linearScale(0, [0, 10], [200, 0])).toBe(200);
    expect(linearScale(10, [0, 10], [200, 0])).toBe(0);
  });
  it("doesn't divide by zero for a flat domain", () => {
    expect(linearScale(5, [5, 5], [0, 100])).toBe(0);
  });
});

describe("barPath", () => {
  it("is empty for a zero-width bar", () => {
    expect(barPath(0, 0, 0, 20, 4)).toBe("");
  });
  it("draws a square rect (no arcs) when radius is 0", () => {
    const d = barPath(0, 0, 40, 20, 0);
    expect(d).toBe("M 0 0 H 40 V 20 H 0 Z");
  });
  it("clamps the radius to half the height for a short bar", () => {
    const d = barPath(0, 0, 40, 6, 4);
    // half of height 6 is 3, so the arc radius clamps to 3
    expect(d).toContain("A 3 3 0 0 1");
  });
  it("clamps the radius to half the width for a thin bar", () => {
    const d = barPath(0, 0, 4, 20, 4);
    expect(d).toContain("A 2 2 0 0 1");
  });
});

describe("stackedMax", () => {
  it("sums the given keys per row and returns the largest", () => {
    const data = [
      { a: 1, b: 2 },
      { a: 5, b: 1 },
      { a: 0, b: 0 },
    ];
    expect(stackedMax(data, ["a", "b"])).toBe(6);
  });
  it("is 0 for empty data", () => {
    expect(stackedMax([], ["a"])).toBe(0);
  });
});
