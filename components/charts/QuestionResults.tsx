"use client";
import { isChoiceType, isScaleType, questionType, SCALES } from "@/lib/answers";
import { formatPercent } from "@/lib/chartMath";
import type { IQuestion } from "@/models/question.model";
import type { DashboardData } from "@/app/dashboard/_components/useDashboardData";
import BarListChart from "./BarListChart";
import ChartCard from "./ChartCard";
import Meter from "./Meter";
import NpsGauge from "./NpsGauge";
import SentimentBar from "./SentimentBar";
import StackedColumnChart from "./StackedColumnChart";
import StatTile from "./StatTile";
import { catColor } from "./tokens";
import { useQuestionStats } from "./useQuestionStats";

/**
 * The per-question Results panel (QuestionView): distribution, average, an
 * NPS block for nps questions, comment rate and cap progress — all of that
 * hidden for plain text questions, which get only volume + sentiment.
 * Score/choice bars are click-to-filter (wired through the same
 * questionFilters the message list below already reads); a text question's
 * volume/sentiment charts aren't, since there's no per-answer filter to set.
 */
export default function QuestionResults({ d, question }: { d: DashboardData; question: IQuestion }) {
  const { data, loading, error, rateLimited, retry } = useQuestionStats(question._id);
  const type = questionType(question);
  const internal = question.visibility === "internal";

  if (loading && !data) {
    return (
      <ChartCard title="Results">
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          Loading results…
        </div>
      </ChartCard>
    );
  }
  if (rateLimited) {
    return (
      <ChartCard title="Results">
        <div className="flex h-24 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <p>Too many analytics requests — try again in a bit.</p>
          <button onClick={retry} className="font-bold text-foreground underline">
            Retry
          </button>
        </div>
      </ChartCard>
    );
  }
  if (error) {
    return (
      <ChartCard title="Results">
        <div className="flex h-24 flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
          <p>{error}</p>
          <button onClick={retry} className="font-bold underline">
            Retry
          </button>
        </div>
      </ChartCard>
    );
  }
  if (!data) return null;

  const caption = `Response results for "${question.questionText}"`;
  const volumeData = data.volume.map((v) => ({ bucket: v.bucket, values: { count: v.count } }));
  const scaleMax = isScaleType(type) ? SCALES[type].max : undefined;

  return (
    <div className="mb-6 space-y-4">
      {type !== "text" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Responses" value={data.totals.responses} />
            <StatTile
              label="With comment"
              value={data.totals.withComment}
              hint={`${formatPercent(data.totals.commentRate)} of responses`}
            />
            {data.average !== null && (
              <StatTile
                label="Average"
                value={data.average}
                formatted={scaleMax ? `${data.average}/${scaleMax}` : String(data.average)}
              />
            )}
            {data.cap.maxResponses !== null && (
              <StatTile
                label="Cap progress"
                value={data.cap.responseCount}
                formatted={formatPercent(data.cap.progress ?? 0)}
                hint={`${data.cap.responseCount}/${data.cap.maxResponses}`}
              />
            )}
          </div>

          {data.cap.maxResponses !== null && (
            <ChartCard title="Response cap">
              <Meter
                label="Responses collected"
                value={data.cap.responseCount}
                max={data.cap.maxResponses}
                progress={data.cap.progress ?? 0}
              />
            </ChartCard>
          )}

          {isScaleType(type) && data.distribution.kind === "scale" && (
            <BarListChart
              title="Score distribution"
              caption={`${caption} — score distribution`}
              items={data.distribution.counts.map((c) => ({
                id: String(c.score),
                label: String(c.score),
                value: c.count,
              }))}
              onItemClick={
                internal ? undefined : (item) => d.setQuestionFilters({ score: item.id })
              }
              clickLabel="Filter responses by this score"
            />
          )}

          {isChoiceType(type) && data.distribution.kind === "choice" && (
            <BarListChart
              title="Choice distribution"
              caption={`${caption} — choice distribution`}
              items={data.distribution.counts.map((c) => ({
                id: c.optionId,
                label: c.label,
                value: c.count,
              }))}
              onItemClick={
                internal ? undefined : (item) => d.setQuestionFilters({ choice: item.id })
              }
              clickLabel="Filter responses by this choice"
            />
          )}

          {type === "nps" && <NpsGauge nps={data.nps} caption={`${caption} — NPS`} />}
        </>
      )}

      <StackedColumnChart
        title="Response volume"
        data={volumeData}
        series={[{ key: "count", label: "Responses", color: catColor(0) }]}
        bucket={data.range.bucket}
        caption={`${caption} — volume over time`}
      />

      <SentimentBar title="Sentiment" totals={data.sentiment.totals} caption={`${caption} — sentiment`} />
    </div>
  );
}
