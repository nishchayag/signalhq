"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import BarListChart from "@/components/charts/BarListChart";
import SentimentBar from "@/components/charts/SentimentBar";
import StackedColumnChart from "@/components/charts/StackedColumnChart";
import StatTile from "@/components/charts/StatTile";
import { SENTIMENT_COLORS, SENTIMENT_ORDER, catColor } from "@/components/charts/tokens";
import { type RangePreset, useOverviewStats } from "@/components/charts/useOverviewStats";
import { Button } from "@/components/ui/button";
import Loader from "@/components/Loader";
import type { MembershipRole } from "@/models/membership.model";
import ErrorState from "../../_components/ErrorState";
import RangePicker from "./RangePicker";

const SENTIMENT_LABEL: Record<(typeof SENTIMENT_ORDER)[number], string> = {
  positive: "Positive",
  neutral: "Neutral",
  mixed: "Mixed",
  negative: "Negative",
};

export default function AnalyticsPageClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const orgId = session?.user?.activeOrgId;
  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);

  const fetchTeams = useCallback(async () => {
    if (!orgId || !isAdmin) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/teams`);
      if (res.data.success) setTeams(res.data.teams);
    } catch {
      // Non-critical: the team filter just stays hidden/empty.
    }
  }, [orgId, isAdmin]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTeamId("");
    fetchTeams();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchTeams]);

  const { data, loading, error, rateLimited, retry } = useOverviewStats({ orgId, preset, teamId });

  if (status === "loading") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <Loader size="sm" label="Loading…" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Analytics</h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <RangePicker value={preset} onChange={setPreset} />
          {isAdmin && teams.length > 0 && (
            <select
              aria-label="Filter by team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-9 rounded-lg border-2 border-ink bg-card px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {!data && loading && (
          <div className="flex justify-center py-16">
            <Loader size="sm" label="Loading analytics…" />
          </div>
        )}

        {!data && rateLimited && (
          <ErrorState message="Too many analytics requests. Please try again in a few minutes." onRetry={retry} />
        )}

        {!data && error && !rateLimited && <ErrorState message={error} onRetry={retry} />}

        {data && (
          <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms ease" }} className="space-y-6">
            {rateLimited && (
              <p className="rounded-lg border-2 border-ink bg-brand-yellow/40 px-3 py-2 text-sm font-semibold text-foreground">
                Too many analytics requests — showing the last loaded data.{" "}
                <button onClick={retry} className="underline">
                  Retry
                </button>
              </p>
            )}
            {error && !rateLimited && (
              <p className="rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                {error}{" "}
                <button onClick={retry} className="underline">
                  Retry
                </button>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Messages" value={data.totals.messages} />
              <StatTile label="Question responses" value={data.totals.question} />
              <StatTile label="General messages" value={data.totals.general} />
              <StatTile label="Unread" value={data.triage.unread} />
              <StatTile label="Awaiting reply" value={data.triage.awaitingReply} accentColor="var(--chart-status-warning)" />
            </div>

            <StackedColumnChart
              title="Message volume"
              data={data.volume.map((v) => ({ bucket: v.bucket, values: { question: v.question, general: v.general } }))}
              series={[
                { key: "question", label: "Question", color: catColor(0) },
                { key: "general", label: "General", color: catColor(1) },
              ]}
              bucket={data.range.bucket}
              caption="Message volume over time, split by question vs. general"
              emptyMessage="No messages in this range"
            />

            <StackedColumnChart
              title="Sentiment trend"
              data={data.sentiment.trend.map((t) => ({
                bucket: t.bucket,
                values: { positive: t.positive, neutral: t.neutral, mixed: t.mixed, negative: t.negative },
              }))}
              series={SENTIMENT_ORDER.map((k) => ({ key: k, label: SENTIMENT_LABEL[k], color: SENTIMENT_COLORS[k] }))}
              bucket={data.range.bucket}
              caption="Sentiment trend over time"
              emptyMessage="No enriched messages in this range yet"
            />

            <SentimentBar title="Sentiment (this range)" totals={data.sentiment.totals} caption="Sentiment totals for the selected range" />

            <div className="grid gap-6 sm:grid-cols-2">
              <BarListChart
                title="Top tags"
                caption="Top AI tags for this range"
                items={data.tags.map((t) => ({ id: t.tag, label: t.tag, value: t.count }))}
                emptyMessage="No tagged messages in this range yet"
              />
              <BarListChart
                title="By team"
                caption="Message volume by team"
                items={data.byTeam.map((t) => ({
                  id: t.teamId ?? "org-level",
                  label: t.name ?? "Organization-wide",
                  value: t.count,
                }))}
                emptyMessage="No team-scoped messages in this range"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
