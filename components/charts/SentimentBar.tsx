import { formatPercent, safeRatio } from "@/lib/chartMath";
import ChartCard from "./ChartCard";
import EmptyChart from "./EmptyChart";
import SegmentBar from "./SegmentBar";
import SrOnlyTable from "./SrOnlyTable";
import { SENTIMENT_COLORS, SENTIMENT_ORDER } from "./tokens";

const SENTIMENT_LABEL: Record<(typeof SENTIMENT_ORDER)[number], string> = {
  positive: "Positive",
  neutral: "Neutral",
  mixed: "Mixed",
  negative: "Negative",
};

/**
 * A single segmented bar showing the share of each sentiment (dataviz:
 * "ordered-scale share" reads as a status split here). Sentiment *means*
 * good→bad, so it wears the status scale (good/warning/critical) rather
 * than a categorical hue, plus a neutral gray for "neutral" — never color
 * alone: every segment is paired with its label and percentage, both in the
 * legend and directly on hover/focus.
 *
 * Not click-to-filter: the message list API has no `sentiment` query param
 * (only `score` and `choice` narrow by answer), so these segments stay
 * static rather than promising a filter that doesn't exist.
 */
export default function SentimentBar({
  title,
  totals,
  caption,
}: {
  title: string;
  totals: Record<(typeof SENTIMENT_ORDER)[number], number>;
  caption: string;
}) {
  const total = SENTIMENT_ORDER.reduce((sum, k) => sum + (totals[k] ?? 0), 0);

  const legend = (
    <div className="flex flex-wrap items-center gap-3">
      {SENTIMENT_ORDER.map((k) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SENTIMENT_COLORS[k] }} />
          <span className="text-xs font-semibold text-muted-foreground">
            {SENTIMENT_LABEL[k]} {total > 0 ? formatPercent(safeRatio(totals[k] ?? 0, total)) : ""}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <ChartCard title={title}>
      {total === 0 ? (
        <EmptyChart message="No enriched messages in this range yet" />
      ) : (
        <SegmentBar
          caption={caption}
          legend={legend}
          segments={SENTIMENT_ORDER.map((k) => ({
            key: k,
            label: SENTIMENT_LABEL[k],
            color: SENTIMENT_COLORS[k],
            value: totals[k] ?? 0,
          }))}
        />
      )}
      <SrOnlyTable
        caption={caption}
        columns={["Sentiment", "Count", "Share"]}
        rows={SENTIMENT_ORDER.map((k) => [
          SENTIMENT_LABEL[k],
          totals[k] ?? 0,
          total > 0 ? formatPercent(safeRatio(totals[k] ?? 0, total)) : "0%",
        ])}
      />
    </ChartCard>
  );
}
