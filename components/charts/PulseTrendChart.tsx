"use client";
import { useState } from "react";
import {
  formatCompactNumber,
  linearScale,
  linePath,
  niceTicks,
  verticalBarPath,
} from "@/lib/chartMath";
import { roundLabel } from "@/lib/pulse";
import ChartCard from "./ChartCard";
import EmptyChart from "./EmptyChart";
import SrOnlyTable from "./SrOnlyTable";
import TooltipBubble from "./TooltipBubble";
import { useContainerWidth } from "./useContainerWidth";
import { catColor } from "./tokens";

export interface PulseRoundDatum {
  /** 0-based (lib/pulse.ts#roundAt); rendered 1-based via roundLabel(). */
  round: number;
  responses: number;
  average: number | null;
  nps: { score: number | null } | null;
}

/** Which line (if any) rides alongside the response-count bars — rating/nps
 * pulses get one, text/choice pulses get bars only (there's no single
 * number to trend for a free-text or multi-option answer). */
export type PulseLineMetric = "average" | "nps" | "none";

const PLOT_TOP = 10;
const PLOT_BOTTOM = 140;
const PLOT_LEFT = 42;
const RIGHT_MARGIN = 8;
const BAR_H = PLOT_BOTTOM + 30;
const LINE_H = PLOT_BOTTOM + 30;
const MAX_X_LABELS = 13;

/**
 * Trend across a pulse question's rounds (Phase 4b). Two small-multiple
 * panels sharing one x-axis (rounds), never one dual-axis plot: response
 * count and average/NPS score are different units on different domains, and
 * overlaying them on a single shared axis would invent an arbitrary
 * alignment between the two (dataviz skill's anti-pattern #1 — see
 * references/anti-patterns.md, "Dual-axis charts"). Bars always render;
 * the line panel is skipped entirely for `metric: "none"` (text/choice
 * pulses have no single number to trend).
 */
export default function PulseTrendChart({
  title = "Pulse trend",
  data,
  metric,
  caption,
}: {
  title?: string;
  data: PulseRoundDatum[];
  metric: PulseLineMetric;
  caption: string;
}) {
  const { ref, width } = useContainerWidth(600);
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <ChartCard title={title}>
        <EmptyChart message="No rounds yet — this pulse hasn't opened" />
      </ChartCard>
    );
  }

  const plotRight = width - RIGHT_MARGIN;
  const bandWidth = (plotRight - PLOT_LEFT) / data.length;
  const barWidth = Math.min(24, bandWidth * 0.6);
  const labelStep = Math.max(1, Math.ceil(data.length / MAX_X_LABELS));
  const xCenter = (i: number) => PLOT_LEFT + bandWidth * i + bandWidth / 2;
  const roundLabels = data.map((d) => roundLabel(d.round));
  const shortLabels = data.map((d) => String(d.round + 1));

  // ---- bars: responses per round ----
  const respMax = Math.max(0, ...data.map((d) => d.responses));
  const respTicks = niceTicks(respMax, 4);
  const respYMax = respTicks[respTicks.length - 1] || 1;
  const respScale = (v: number) => linearScale(v, [0, respYMax], [PLOT_BOTTOM, PLOT_TOP]);

  // ---- line: average (rating) or NPS score, its own independent scale ----
  const isNps = metric === "nps";
  const lineDomain: [number, number] = isNps ? [-100, 100] : [1, 5];
  const lineTicks = isNps ? [-100, -50, 0, 50, 100] : [1, 2, 3, 4, 5];
  const lineScale = (v: number) => linearScale(v, lineDomain, [PLOT_BOTTOM, PLOT_TOP]);
  const lineValue = (d: PulseRoundDatum) => (isNps ? d.nps?.score ?? null : d.average);
  const linePoints = data
    .map((d, i) => ({ i, v: lineValue(d) }))
    .filter((p): p is { i: number; v: number } => p.v !== null)
    .map((p) => ({ x: xCenter(p.i), y: lineScale(p.v) }));

  const captionSuffix = isNps ? " — NPS per round" : metric === "average" ? " — average score per round" : "";

  return (
    <ChartCard title={title}>
      <div ref={ref} className="space-y-4">
        {/* Panel 1: responses per round (always shown). */}
        <div className="relative">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Responses per round</p>
          <svg
            viewBox={`0 0 ${width} ${BAR_H}`}
            style={{ width: "100%", height: BAR_H }}
            className="font-sans"
            role="img"
            aria-label={`${caption} — responses per round`}
          >
            {respTicks.map((t) => {
              const y = respScale(t);
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
              const h = PLOT_BOTTOM - respScale(d.responses);
              const path = verticalBarPath(xCenter(i) - barWidth / 2, PLOT_BOTTOM - h, barWidth, h, 4);
              return (
                <g key={d.round}>
                  {path && (
                    <path
                      d={path}
                      fill={catColor(0)}
                      opacity={activeBar === null || activeBar === i ? 1 : 0.45}
                      style={{ transition: "opacity 120ms ease", pointerEvents: "none" }}
                    />
                  )}
                  {/* Hit target: the whole band, painted after the bar so it stays on top. */}
                  <rect
                    x={PLOT_LEFT + bandWidth * i}
                    y={PLOT_TOP}
                    width={bandWidth}
                    height={PLOT_BOTTOM - PLOT_TOP}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${roundLabels[i]}: ${d.responses} response${d.responses === 1 ? "" : "s"}`}
                    onPointerEnter={() => setActiveBar(i)}
                    onPointerLeave={() => setActiveBar((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActiveBar(i)}
                    onBlur={() => setActiveBar((cur) => (cur === i ? null : cur))}
                  />
                  {i % labelStep === 0 && (
                    <text x={xCenter(i)} y={PLOT_BOTTOM + 16} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                      {shortLabels[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {activeBar !== null && (
            <TooltipBubble left={(xCenter(activeBar) / width) * 100} top={(PLOT_TOP / BAR_H) * 100}>
              <p className="font-bold text-foreground">{roundLabels[activeBar]}</p>
              <p className="text-muted-foreground">
                <span className="font-bold text-foreground">{data[activeBar].responses}</span> response
                {data[activeBar].responses === 1 ? "" : "s"}
              </p>
            </TooltipBubble>
          )}
        </div>

        {/* Panel 2: average/NPS per round — its own axis, never sharing the
            bars' pixel scale (see the anti-dual-axis note above). */}
        {metric !== "none" && (
          <div className="relative">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {isNps ? "NPS per round" : "Average score per round"}
            </p>
            <svg
              viewBox={`0 0 ${width} ${LINE_H}`}
              style={{ width: "100%", height: LINE_H }}
              className="font-sans"
              role="img"
              aria-label={`${caption}${captionSuffix}`}
            >
              {lineTicks.map((t) => {
                const y = lineScale(t);
                return (
                  <g key={t}>
                    <line x1={PLOT_LEFT} x2={plotRight} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                    <text x={PLOT_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted-foreground)">
                      {t}
                    </text>
                  </g>
                );
              })}
              <line x1={PLOT_LEFT} x2={plotRight} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--chart-axis)" strokeWidth={1} />

              {linePoints.length > 0 && (
                <path d={linePath(linePoints)} fill="none" stroke={catColor(1)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {data.map((d, i) => {
                const v = lineValue(d);
                if (v === null) return null;
                const cx = xCenter(i);
                const cy = lineScale(v);
                return (
                  <g key={d.round}>
                    <circle cx={cx} cy={cy} r={4} fill={catColor(1)} stroke="var(--card)" strokeWidth={2} style={{ pointerEvents: "none" }} />
                    <rect
                      x={PLOT_LEFT + bandWidth * i}
                      y={PLOT_TOP}
                      width={bandWidth}
                      height={PLOT_BOTTOM - PLOT_TOP}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`${roundLabels[i]}: ${isNps ? `NPS ${v}` : `average ${v}`}`}
                      onPointerEnter={() => setActiveLine(i)}
                      onPointerLeave={() => setActiveLine((cur) => (cur === i ? null : cur))}
                      onFocus={() => setActiveLine(i)}
                      onBlur={() => setActiveLine((cur) => (cur === i ? null : cur))}
                    />
                    {i % labelStep === 0 && (
                      <text x={cx} y={PLOT_BOTTOM + 16} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                        {shortLabels[i]}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {activeLine !== null && lineValue(data[activeLine]) !== null && (
              <TooltipBubble left={(xCenter(activeLine) / width) * 100} top={(PLOT_TOP / LINE_H) * 100}>
                <p className="font-bold text-foreground">{roundLabels[activeLine]}</p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-0.5 rounded-sm" style={{ backgroundColor: catColor(1) }} />
                  <span className="font-bold text-foreground">{lineValue(data[activeLine])}</span>
                  <span>{isNps ? "NPS" : "average"}</span>
                </p>
              </TooltipBubble>
            )}
          </div>
        )}
      </div>

      <SrOnlyTable
        caption={caption}
        columns={["Round", "Responses", ...(metric !== "none" ? [isNps ? "NPS" : "Average"] : [])]}
        rows={data.map((d, i) => [
          roundLabels[i],
          d.responses,
          ...(metric !== "none" ? [lineValue(d) ?? "—"] : []),
        ])}
      />
    </ChartCard>
  );
}
