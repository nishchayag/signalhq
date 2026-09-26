"use client";
import { useState } from "react";
import { bucketLabel, formatCompactNumber, linearScale, niceTicks, stackedMax } from "@/lib/chartMath";
import ChartCard from "./ChartCard";
import EmptyChart from "./EmptyChart";
import SrOnlyTable from "./SrOnlyTable";
import TooltipBubble from "./TooltipBubble";
import { useContainerWidth } from "./useContainerWidth";

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
}

export interface ColumnDatum {
  bucket: string;
  values: Record<string, number>;
}

const H = 240;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 188;
const PLOT_LEFT = 42;
const RIGHT_MARGIN = 8;
const GAP = 2; // surface gap between stacked segments
const MAX_X_LABELS = 6;

/**
 * A time-series stacked column chart (dataviz: "trend over time" +
 * "part-to-whole" combined — volume splits into question/general per
 * bucket, sentiment splits into positive/neutral/mixed/negative). Bars
 * <=24px, 2px surface gap between segments, square baseline. One crosshair
 * tooltip per bucket listing every series (interaction.md).
 */
export default function StackedColumnChart({
  title,
  data,
  series,
  bucket,
  caption,
  emptyMessage,
}: {
  title: string;
  data: ColumnDatum[];
  series: ColumnSeries[];
  bucket: "day" | "week";
  caption: string;
  emptyMessage?: string;
}) {
  const { ref, width } = useContainerWidth(600);
  const [active, setActive] = useState<number | null>(null);
  const hasData = data.length > 0 && data.some((d) => series.some((s) => (d.values[s.key] ?? 0) > 0));

  const plotRight = width - RIGHT_MARGIN;
  const keys = series.map((s) => s.key);
  const rawMax = stackedMax(data.map((d) => d.values), keys);
  const ticks = niceTicks(rawMax, 4);
  const yMax = ticks[ticks.length - 1] || 1;
  const yScale = (v: number) => linearScale(v, [0, yMax], [PLOT_BOTTOM, PLOT_TOP]);

  const bandWidth = data.length > 0 ? (plotRight - PLOT_LEFT) / data.length : 0;
  const barWidth = Math.min(24, bandWidth * 0.6);
  const labelStep = Math.max(1, Math.ceil(data.length / MAX_X_LABELS));

  const legend = (
    <div className="flex flex-wrap items-center gap-3">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ChartCard title={title} action={series.length > 1 ? legend : undefined}>
      {!hasData ? (
        <EmptyChart message={emptyMessage} />
      ) : (
        <div ref={ref} className="relative">
          <svg
            viewBox={`0 0 ${width} ${H}`}
            style={{ width: "100%", height: H }}
            className="font-sans"
            role="img"
            aria-label={caption}
          >
            {ticks.map((t) => {
              const y = yScale(t);
              return (
                <g key={t}>
                  <line x1={PLOT_LEFT} x2={plotRight} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                  <text x={PLOT_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted-foreground)">
                    {formatCompactNumber(t)}
                  </text>
                </g>
              );
            })}
            <line x1={PLOT_LEFT} x2={plotRight} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--chart-axis)" strokeWidth={1} />

            {data.map((d, i) => {
              const cx = PLOT_LEFT + bandWidth * i + bandWidth / 2;
              let cursor = PLOT_BOTTOM;
              const segments = series.map((s, si) => {
                const value = d.values[s.key] ?? 0;
                const rawHeight = PLOT_BOTTOM - yScale(value);
                const rawTop = cursor - rawHeight;
                const isBottom = si === 0;
                const isTop = si === series.length - 1;
                const drawTop = isTop ? rawTop : rawTop + GAP / 2;
                const drawBottom = isBottom ? cursor : cursor - GAP / 2;
                const height = Math.max(0, drawBottom - drawTop);
                cursor = rawTop;
                return { key: s.key, color: s.color, y: drawTop, height, isBottom };
              });
              return (
                <g key={d.bucket}>
                  {segments.map((seg) => (
                    <rect
                      key={seg.key}
                      x={cx - barWidth / 2}
                      y={seg.y}
                      width={barWidth}
                      height={seg.height}
                      rx={seg.isBottom ? 0 : 3}
                      fill={seg.color}
                      opacity={active === null || active === i ? 1 : 0.45}
                      style={{ transition: "opacity 120ms ease", pointerEvents: "none" }}
                    />
                  ))}
                  {/* Hit target: the whole band, taller than the bars, painted after the
                      segments so it stays on top and actually receives the pointer. */}
                  <rect
                    x={PLOT_LEFT + bandWidth * i}
                    y={PLOT_TOP}
                    width={bandWidth}
                    height={PLOT_BOTTOM - PLOT_TOP}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${bucketLabel(d.bucket, bucket)}: ${series
                      .map((s) => `${s.label} ${d.values[s.key] ?? 0}`)
                      .join(", ")}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                  />
                  {i % labelStep === 0 && (
                    <text x={cx} y={PLOT_BOTTOM + 16} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                      {bucketLabel(d.bucket, bucket)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {active !== null && data[active] && (
            <TooltipBubble left={((active + 0.5) / data.length) * 100} top={(PLOT_TOP / H) * 100}>
              <p className="font-bold text-foreground">{bucketLabel(data[active].bucket, bucket)}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="font-bold text-foreground">{data[active].values[s.key] ?? 0}</span>
                  <span>{s.label}</span>
                </p>
              ))}
            </TooltipBubble>
          )}
        </div>
      )}
      <SrOnlyTable
        caption={caption}
        columns={["Bucket", ...series.map((s) => s.label)]}
        rows={data.map((d) => [bucketLabel(d.bucket, bucket), ...series.map((s) => d.values[s.key] ?? 0)])}
      />
    </ChartCard>
  );
}
