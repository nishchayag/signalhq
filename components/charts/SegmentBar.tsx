"use client";
import { useId, useState, type ReactNode } from "react";
import { formatPercent, safeRatio } from "@/lib/chartMath";
import TooltipBubble from "./TooltipBubble";
import { useContainerWidth } from "./useContainerWidth";

const H = 28;
const GAP = 2;

export interface Segment {
  key: string;
  label: string;
  color: string;
  value: number;
}

/**
 * Shared primitive behind SentimentBar and NpsGauge: a single full-width
 * bar split into proportional segments, rounded outer ends via a clip-path
 * (so individual segment rects stay simple, undistorted squares), a 2px
 * surface gap between segments, hover/focus tooltip per segment. Status/
 * sentiment colors only — never a categorical hue — since every caller here
 * is a good↔bad share, not series identity.
 */
export default function SegmentBar({ segments, caption, legend }: { segments: Segment[]; caption: string; legend?: ReactNode }) {
  const clipId = useId();
  const { ref, width } = useContainerWidth(360);
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const laid = segments.reduce<{ items: (Segment & { x: number; w: number })[]; cursor: number }>(
    (acc, s, i) => {
      const share = safeRatio(s.value, total) * width;
      const x = acc.cursor + (i > 0 ? GAP / 2 : 0);
      const w = Math.max(0, share - (i > 0 ? GAP / 2 : 0) - (i < segments.length - 1 ? GAP / 2 : 0));
      return { items: [...acc.items, { ...s, x, w }], cursor: acc.cursor + share };
    },
    { items: [], cursor: 0 }
  ).items;

  return (
    <div className="space-y-3">
      {legend}
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${width} ${H}`} style={{ width: "100%", height: H }} role="img" aria-label={caption}>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={width} height={H} rx={6} ry={6} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {laid.map((seg, i) => (
              <rect
                key={seg.key}
                x={seg.x}
                y={0}
                width={seg.w}
                height={H}
                fill={seg.color}
                opacity={active === null || active === i ? 1 : 0.5}
                style={{ transition: "opacity 120ms ease" }}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                tabIndex={seg.w > 0 ? 0 : undefined}
                role={seg.w > 0 ? "img" : undefined}
                aria-label={`${seg.label}: ${seg.value} (${formatPercent(safeRatio(seg.value, total))})`}
              />
            ))}
          </g>
        </svg>
        {active !== null && width > 0 && laid[active] && (
          <TooltipBubble left={((laid[active].x + laid[active].w / 2) / width) * 100} top={0}>
            <p className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: laid[active].color }} />
              <span className="font-bold text-foreground">{laid[active].value}</span>
              <span className="text-muted-foreground">{laid[active].label}</span>
            </p>
          </TooltipBubble>
        )}
      </div>
    </div>
  );
}
