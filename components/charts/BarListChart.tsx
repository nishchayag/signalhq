"use client";
import { useState } from "react";
import { barPath, formatCompactNumber, linearScale } from "@/lib/chartMath";
import ChartCard from "./ChartCard";
import EmptyChart from "./EmptyChart";
import SrOnlyTable from "./SrOnlyTable";
import { catColor } from "./tokens";
import { useContainerWidth } from "./useContainerWidth";

export interface BarListItem {
  id: string;
  label: string;
  value: number;
}

const ROW_H = 32;
const BAR_H = 18;
const VALUE_GUTTER = 44;

/**
 * A horizontal bar list — distributions, top tags, by-team volume. Nominal
 * data (a tag/team/option name doesn't have an inherent order): every bar
 * takes the *same* single categorical color, since it's one series (a
 * count), not several identities — no legend box needed. The label lives in
 * a plain HTML column (robust truncation via CSS); only the bar mark itself
 * is real SVG, at 1 real pixel per unit so it's crisp at any width.
 */
export default function BarListChart({
  title,
  items,
  caption,
  color = catColor(0),
  onItemClick,
  clickLabel,
  emptyMessage,
}: {
  title: string;
  items: BarListItem[];
  caption: string;
  color?: string;
  /** Present only when the target filter is actually supported by the
   * message list API — omit to render a plain, non-interactive chart. */
  onItemClick?: (item: BarListItem) => void;
  /** Screen-reader hint appended to each bar's label, e.g. "filter messages".
   * A function receives the item and returns the full aria-label (e.g.
   * "Filter messages by tag bug") when the wording needs the item's own
   * value rather than a generic suffix. */
  clickLabel?: string | ((item: BarListItem) => string);
  emptyMessage?: string;
}) {
  const { ref, width } = useContainerWidth(360);
  const [active, setActive] = useState<string | null>(null);
  const hasData = items.length > 0 && items.some((it) => it.value > 0);
  const max = Math.max(1, ...items.map((it) => it.value));
  const trackWidth = Math.max(0, width - VALUE_GUTTER);
  const height = items.length * ROW_H;

  return (
    <ChartCard title={title}>
      {!hasData ? (
        <EmptyChart message={emptyMessage} />
      ) : (
        <div className="grid grid-cols-[minmax(72px,30%)_1fr] gap-2">
          <div>
            {items.map((it) => (
              <div
                key={it.id}
                style={{ height: ROW_H }}
                className="flex items-center justify-end truncate text-right text-xs font-semibold text-muted-foreground"
                title={it.label}
              >
                {it.label}
              </div>
            ))}
          </div>
          <div ref={ref}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{ width: "100%", height }}
              className="font-sans"
              role="img"
              aria-label={caption}
            >
              {items.map((it, i) => {
                const barW = linearScale(it.value, [0, max], [0, trackWidth - 4]);
                const y = i * ROW_H + (ROW_H - BAR_H) / 2;
                const clickable = Boolean(onItemClick && it.value > 0);
                return (
                  <g
                    key={it.id}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    aria-label={
                      clickable
                        ? typeof clickLabel === "function"
                          ? clickLabel(it)
                          : `${it.label}: ${it.value}. ${clickLabel ?? ""}`.trim()
                        : undefined
                    }
                    className={clickable ? "cursor-pointer" : undefined}
                    onPointerEnter={() => setActive(it.id)}
                    onPointerLeave={() => setActive((cur) => (cur === it.id ? null : cur))}
                    onFocus={() => setActive(it.id)}
                    onBlur={() => setActive((cur) => (cur === it.id ? null : cur))}
                    onClick={clickable ? () => onItemClick?.(it) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onItemClick?.(it);
                            }
                          }
                        : undefined
                    }
                  >
                    {/* Generous hit target: the full row, not just the bar. */}
                    <rect x={0} y={i * ROW_H} width={width} height={ROW_H} fill="transparent" />
                    <path
                      d={barPath(0, y, Math.max(2, barW), BAR_H, 4)}
                      fill={color}
                      opacity={active === null || active === it.id ? 1 : 0.55}
                      style={{ transition: "opacity 120ms ease" }}
                    />
                    <text
                      x={Math.max(2, barW) + 6}
                      y={y + BAR_H / 2}
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill="var(--foreground)"
                    >
                      {formatCompactNumber(it.value)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
      <SrOnlyTable
        caption={caption}
        columns={["Label", "Count"]}
        rows={items.map((it) => [it.label, it.value])}
      />
    </ChartCard>
  );
}
