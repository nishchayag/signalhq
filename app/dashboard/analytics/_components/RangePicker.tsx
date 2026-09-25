import type { RangePreset } from "@/components/charts/useOverviewStats";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
];

/** Date-range presets, one row above everything they scope (interaction.md:
 * "date range first", presets before a custom range — there's no custom
 * range here, just the four presets the task calls for). */
export default function RangePicker({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (preset: RangePreset) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border-2 border-ink" role="group" aria-label="Date range">
      {PRESETS.map((p, i) => (
        <button
          key={p.value}
          type="button"
          aria-pressed={value === p.value}
          onClick={() => onChange(p.value)}
          className={`h-9 px-3 text-sm font-bold transition-colors ${i > 0 ? "border-l-2 border-ink" : ""} ${
            value === p.value ? "bg-brand-yellow text-on-brand" : "bg-card text-foreground hover:bg-secondary"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
