// Pure math/formatting helpers for components/charts/*. No React, no DOM —
// framework-agnostic so they're plain Vitest units (see chartMath.test.ts).
// Chart components import these instead of inlining scale/tick/label logic,
// so every chart rounds ticks and formats buckets the same way.

/** Clamp to [0, 1] — used for progress/percentage widths. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Safe ratio: 0 when the denominator is 0 (never NaN/Infinity). */
export function safeRatio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

/**
 * "Nice" round numbers for a y-axis, 0..max, per marks-and-anatomy.md ("round
 * to clean numbers (0 / 1,000 / 2,000)"). Returns `count + 1` ascending
 * ticks starting at 0; the top tick is >= max (the axis never clips data).
 * max <= 0 ⇒ a flat [0] axis (no data yet).
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  // Snap the step to 1/2/5/10 × the magnitude — the standard "nice number" ladder.
  let niceResidual: number;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  const step = niceResidual * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Compact axis/stat-tile number: 1,284 / 12.9K / 4.2M (marks-and-anatomy.md's
 * stat-tile contract). Negative numbers keep their sign.
 */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return sign + Math.round(abs).toLocaleString("en-US");
  if (abs < 1_000_000) return sign + trimZero(abs / 1000) + "K";
  if (abs < 1_000_000_000) return sign + trimZero(abs / 1_000_000) + "M";
  return sign + trimZero(abs / 1_000_000_000) + "B";
}

function trimZero(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** `n%`, rounded to the nearest integer. */
export function formatPercent(ratio: number): string {
  return `${Math.round(clamp01(ratio) * 100)}%`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A bucket key ("2026-09-01", the local calendar day/week start already
 * computed server-side) → a short axis/tooltip label. Parsed as plain
 * Y/M/D components — never through `new Date(str)` — so it can't shift a
 * day across a UTC/local boundary. `bucket: "week"` gets a "Wk of " prefix.
 */
export function bucketLabel(key: string, bucket: "day" | "week" = "day"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const month = SHORT_MONTHS[Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  const label = `${month} ${day}`;
  return bucket === "week" ? `Wk of ${label}` : label;
}

export interface NpsSegments {
  promoterPct: number; // 0..1 of total
  passivePct: number;
  detractorPct: number;
}

/** Proportional widths (0..1, summing to <= 1) for the NPS segment bar. */
export function npsSegments(promoters: number, passives: number, detractors: number): NpsSegments {
  const total = promoters + passives + detractors;
  return {
    promoterPct: safeRatio(promoters, total),
    passivePct: safeRatio(passives, total),
    detractorPct: safeRatio(detractors, total),
  };
}

/** Linear interpolation of `value` from `domain` into `range` (pixel space). */
export function linearScale(value: number, domain: [number, number], range: [number, number]): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return r0;
  const t = (value - d0) / (d1 - d0);
  return r0 + t * (r1 - r0);
}

/**
 * An SVG path for a horizontal bar: square at the baseline (left edge),
 * 4px-style rounded corners at the data-end (right edge) — marks-and-anatomy's
 * "4px rounded data-end, square at the baseline" rule, mirrored horizontally.
 * A plain `<rect rx>` can't do asymmetric corners, hence the path. Radius
 * clamps to half the height/width so it never overshoots a short/thin bar.
 * Returns "" for a zero-or-negative width (nothing to draw).
 */
export function barPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (width <= 0 || height <= 0) return "";
  const r = Math.max(0, Math.min(radius, height / 2, width / 2));
  if (r === 0) return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  return [
    `M ${x} ${y}`,
    `H ${x + width - r}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H ${x}`,
    "Z",
  ].join(" ");
}

/** The largest per-item stacked total across a series list — the y-axis max
 * for a stacked column chart. */
export function stackedMax<T>(data: T[], keys: (keyof T)[]): number {
  let max = 0;
  for (const row of data) {
    let sum = 0;
    for (const k of keys) sum += Number(row[k]) || 0;
    if (sum > max) max = sum;
  }
  return max;
}
