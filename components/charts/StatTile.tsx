import { formatCompactNumber } from "@/lib/chartMath";

/**
 * The figure contract (marks-and-anatomy.md): sentence-case label, a
 * semibold auto-compact value in proportional figures (never tabular-nums —
 * that's for columns of aligned numbers, not a standalone stat), and an
 * optional secondary hint line. No delta/sparkline here — the analytics API
 * doesn't give a prior-period baseline to compare against.
 */
export default function StatTile({
  label,
  value,
  hint,
  accentColor,
  formatted,
}: {
  label: string;
  value: number;
  hint?: string;
  /** A status/chart color for the value text — used sparingly (e.g. an
   * "awaiting reply" count in the warning tone). Omit for the plain default. */
  accentColor?: string;
  /** A pre-formatted display value (e.g. "4.2/5") for a precise decimal that
   * formatCompactNumber's rounding would otherwise flatten. */
  formatted?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-card p-4 shadow-solid-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-3xl font-black text-foreground"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {formatted ?? formatCompactNumber(value)}
      </p>
      {hint && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}
