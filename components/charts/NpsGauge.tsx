import ChartCard from "./ChartCard";
import EmptyChart from "./EmptyChart";
import SegmentBar from "./SegmentBar";
import SrOnlyTable from "./SrOnlyTable";
import { STATUS_COLORS } from "./tokens";

export interface NpsStats {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoterPct: number;
  detractorPct: number;
}

/**
 * NPS gauge: the score as a small hero figure (proportional figures, per
 * marks-and-anatomy — never tabular-nums on a standalone number) plus a
 * promoters/passives/detractors segment bar. This *means* good→bad, so it
 * wears the status scale, same framing as SentimentBar.
 */
export default function NpsGauge({ nps, caption }: { nps: NpsStats | null; caption: string }) {
  if (!nps || nps.total === 0) {
    return (
      <ChartCard title="NPS">
        <EmptyChart message="No NPS responses in this range" />
      </ChartCard>
    );
  }

  const legend = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS.good }} />
        <span className="text-xs font-semibold text-muted-foreground">
          Promoters {Math.round(nps.promoterPct)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "var(--muted-foreground)" }} />
        <span className="text-xs font-semibold text-muted-foreground">Passives</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS.critical }} />
        <span className="text-xs font-semibold text-muted-foreground">
          Detractors {Math.round(nps.detractorPct)}%
        </span>
      </div>
    </div>
  );

  return (
    <ChartCard title="NPS">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-4xl font-black text-foreground">{nps.score}</span>
        <span className="text-sm font-semibold text-muted-foreground">
          from {nps.total} response{nps.total === 1 ? "" : "s"}
        </span>
      </div>
      <SegmentBar
        caption={caption}
        legend={legend}
        segments={[
          { key: "promoters", label: "Promoters", color: STATUS_COLORS.good, value: nps.promoters },
          { key: "passives", label: "Passives", color: "var(--muted-foreground)", value: nps.passives },
          { key: "detractors", label: "Detractors", color: STATUS_COLORS.critical, value: nps.detractors },
        ]}
      />
      <SrOnlyTable
        caption={caption}
        columns={["Segment", "Count"]}
        rows={[
          ["Promoters", nps.promoters],
          ["Passives", nps.passives],
          ["Detractors", nps.detractors],
          ["NPS score", nps.score ?? 0],
        ]}
      />
    </ChartCard>
  );
}
