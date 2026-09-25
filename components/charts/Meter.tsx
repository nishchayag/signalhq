import { clamp01, formatPercent } from "@/lib/chartMath";
import { catColor } from "./tokens";

/**
 * Progress meter for a response cap: the fill carries the ratio, the
 * unfilled track is a lighter step of the *same* ramp (marks-and-anatomy's
 * meter contract) rather than a plain gray — so severity reads across the
 * whole bar, not just the filled part.
 */
export default function Meter({
  label,
  value,
  max,
  progress,
}: {
  label: string;
  value: number;
  max: number;
  progress: number; // 0..1
}) {
  const pct = clamp01(progress);
  const color = catColor(0);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">
          {value}/{max} · {formatPercent(pct)}
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full border-2 border-ink"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, var(--card))` }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
