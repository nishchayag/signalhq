// Client-side mirror of the JSON shapes documented at the top of
// lib/responseStats.ts (GET /api/analytics/overview and
// /api/analytics/questions/[id]). Kept here, framework-free, so both the
// overview page and the QuestionView results panel import one definition.

export interface StatsRangeJson {
  from: string;
  to: string;
  tz: string;
  bucket: "day" | "week";
  clamped: boolean;
}

export interface SentimentTotals {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
}

export type SentimentTrendPoint = { bucket: string } & SentimentTotals;

export interface SentimentStats {
  totals: SentimentTotals;
  trend: SentimentTrendPoint[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface OverviewVolumePoint {
  bucket: string;
  total: number;
  question: number;
  general: number;
}

export interface ByTeamEntry {
  teamId: string | null;
  name: string | null;
  count: number;
}

export interface TriageTotals {
  unread: number;
  archived: number;
  assigned: number;
  awaitingReply: number;
}

export interface OverviewStats {
  success: true;
  range: StatsRangeJson;
  totals: { messages: number; question: number; general: number };
  volume: OverviewVolumePoint[];
  byTeam: ByTeamEntry[];
  sentiment: SentimentStats;
  tags: TagCount[];
  triage: TriageTotals;
}

export type ScaleDistribution = {
  kind: "scale";
  min: number;
  max: number;
  counts: { score: number; count: number }[];
};
export type ChoiceDistribution = {
  kind: "choice";
  respondents: number;
  counts: { optionId: string; label: string; count: number }[];
};
export type TextDistribution = { kind: "text" };
export type Distribution = ScaleDistribution | ChoiceDistribution | TextDistribution;

export interface NpsStatsApi {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoterPct: number;
  detractorPct: number;
}

export interface QuestionVolumePoint {
  bucket: string;
  count: number;
}

export interface QuestionStats {
  success: true;
  range: StatsRangeJson;
  question: { id: string; questionText: string; type: string; visibility: string };
  totals: { responses: number; withComment: number; commentRate: number };
  volume: QuestionVolumePoint[];
  distribution: Distribution;
  average: number | null;
  nps: NpsStatsApi | null;
  cap: { responseCount: number; maxResponses: number | null; progress: number | null };
  sentiment: SentimentStats;
  tags: TagCount[];
}

export const CURRENT_TZ = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};
