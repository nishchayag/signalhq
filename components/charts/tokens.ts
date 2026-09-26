// Chart color roles (dataviz skill, "color follows the entity"). These read
// the CSS custom properties defined in app/globals.css, which already carry
// the light/dark split — components never branch on theme themselves.

/** 8-slot categorical palette, fixed order — never cycle past index 7. */
export const CAT_COLORS = [
  "var(--chart-cat-1)",
  "var(--chart-cat-2)",
  "var(--chart-cat-3)",
  "var(--chart-cat-4)",
  "var(--chart-cat-5)",
  "var(--chart-cat-6)",
  "var(--chart-cat-7)",
  "var(--chart-cat-8)",
] as const;

/** Status scale — reserved meaning (good→critical), never a series color. */
export const STATUS_COLORS = {
  good: "var(--chart-status-good)",
  warning: "var(--chart-status-warning)",
  serious: "var(--chart-status-serious)",
  critical: "var(--chart-status-critical)",
} as const;

/** Sentiment maps onto the status scale (it *means* good/bad), plus a
 * neutral gray for the "neutral" bucket, which isn't good or bad. */
export const SENTIMENT_COLORS = {
  positive: STATUS_COLORS.good,
  mixed: STATUS_COLORS.warning,
  negative: STATUS_COLORS.critical,
  neutral: "var(--muted-foreground)",
} as const;

export const SENTIMENT_ORDER = ["positive", "neutral", "mixed", "negative"] as const;

export const CHART_GRID = "var(--chart-grid)";
export const CHART_AXIS = "var(--chart-axis)";

/** One categorical slot, by position — a nominal single-series bar list
 * (tags, teams) always uses slot 1, never a per-bar gradient. */
export function catColor(index: number): string {
  return CAT_COLORS[index % CAT_COLORS.length];
}
