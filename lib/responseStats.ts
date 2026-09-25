/**
 * Response analytics: Mongo aggregations behind
 *   GET /api/analytics/overview            (the active org)
 *   GET /api/analytics/questions/[id]      (one question)
 *
 * Query params (both routes):
 *   from, to  YYYY-MM-DD (a local calendar day in `tz`; `to` is inclusive)
 *             or a full ISO datetime (`to` is then exclusive). Invalid → 400,
 *             from >= to → 400.
 *             Defaults: overview = the last 30 local days incl. today;
 *             question = from the question's creation to now.
 *             The span is capped at 12 months: an earlier `from` is moved up
 *             to `to` − 12 months and `range.clamped` is true.
 *   tz        IANA time zone (validated via Intl, canonicalised — range.tz
 *             echoes the canonical name, e.g. Asia/Calcutta), default UTC. 400 if unknown.
 *             Day/week buckets are local calendar days/weeks in this zone.
 *   bucket    day | week (weeks start Monday). Default: day when the span is
 *             ≤ 92 days, else week. Anything else → 400.
 *   teamId    overview only: narrow to one team (24-hex, else 404). It only
 *             narrows — a MEMBER passing another team's id gets zeros.
 *
 * Every time series is zero-filled across the whole range, one point per
 * bucket, oldest first, keyed by the bucket's local start date "YYYY-MM-DD".
 * Counts include archived messages (analytics counts every response; the
 * triage block is where archive state shows). Sentiment and tags come only
 * from `ai.sentiment` / `ai.tags`; toxicity and PII are never read,
 * aggregated or returned, for any role.
 *
 * ---- GET /api/analytics/overview → OverviewStats ----
 * {
 *   success: true,
 *   range: { from: ISO, to: ISO, tz, bucket: "day"|"week", clamped: boolean },
 *   totals: { messages, question, general },
 *   volume: [{ bucket: "2026-09-01", total, question, general }],
 *   byTeam: [{ teamId: string|null, name: string|null, count }],  // null = org-level; count desc
 *   sentiment: {
 *     totals: { positive, neutral, negative, mixed },
 *     trend:  [{ bucket, positive, neutral, negative, mixed }],
 *   },
 *   tags: [{ tag, count }],                                        // top 10, count desc
 *   triage: { unread, archived, assigned, awaitingReply },
 * }
 * Scope: the active org's inbox (lib/triageScope.ts#orgInboxScope): never
 * members' private threads; MEMBERs see org-level + their own teams only.
 * `triage` uses the same range/team filter: `unread` = open messages unread
 * by the viewer (lib/readState.ts), `archived` = archived, `assigned` = open
 * and assigned to anyone, `awaitingReply` = open with a sender follow-up the
 * org hasn't answered (`awaitingOrg`).
 *
 * ---- GET /api/analytics/questions/[id] → QuestionStats ----
 * {
 *   success: true,
 *   range: { ... as above },
 *   question: { id, questionText, type, visibility },
 *   totals: { responses, withComment, commentRate },   // commentRate 0..1 (3 dp), 0 when no responses
 *   volume: [{ bucket, count }],
 *   distribution:
 *       { kind: "scale", min, max, counts: [{ score, count }] }       // rating 1–5 / nps 0–10, every score present
 *     | { kind: "choice", respondents, counts: [{ optionId, label, count }] } // current options, current labels
 *     | { kind: "text" },
 *   average: number | null,  // rating/nps, 2 dp; null iff 0 scored answers (and for non-scale types)
 *   nps: null | { score: number|null, promoters, passives, detractors, total,
 *                 promoterPct, detractorPct },
 *        // nps questions only. score = round(%promoters(9–10) − %detractors(0–6));
 *        // score is null iff total is 0 (the pcts are then 0).
 *   cap: { responseCount, maxResponses: number|null, progress: number|null },
 *        // all-time, not range-limited; progress 0..1 (3 dp), null when uncapped
 *   sentiment: { totals, trend },  // as in the overview
 *   tags: [{ tag, count }],
 * }
 * Access: same as the question GET (lib/questionAccess.ts#loadAndAuthorize,
 * team-scoped), plus internal questions need `question:viewAllReplies` (403)
 * — their responses are members' private threads, which are included here
 * for those roles. Public questions exclude member threads.
 */
import mongoose from "mongoose";
import MessageModel, { AI_SENTIMENTS, type AiSentiment } from "@/models/message.model";
import { SCALES, isChoiceType, isScaleType, questionType, type QuestionType } from "@/lib/answers";

/** Per-user limit shared by both analytics routes (429 past it). */
export const ANALYTICS_RATE_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 } as const;
export const analyticsRateKey = (userId: string) => `analytics:${userId}`;

// ---------------------------------------------------------------- params

export type Bucket = "day" | "week";

export interface StatsRange {
  from: Date;
  to: Date; // exclusive
  tz: string;
  bucket: Bucket;
  clamped: boolean;
}

export const RANGE_MAX_MONTHS = 12;
const DEFAULT_OVERVIEW_DAYS = 30;
const AUTO_WEEK_AFTER_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_TAGS = 10;

/**
 * Canonical IANA zone name, or null if Intl doesn't know it. The canonical
 * form matters: Mongo's `timezone` is case-sensitive ("utc" is an error,
 * "UTC" isn't), and ICU canonicalises to the long-standing link names
 * ("Asia/Kolkata" → "Asia/Calcutta", "Europe/Kyiv" → "Europe/Kiev"), which
 * Mongo's tzdata also knows (measured on MongoDB 8.2). Offsets like "+05:30"
 * pass through and Mongo accepts them too.
 */
export function resolveTimeZone(tz: string | null | undefined): string | null {
  if (tz == null || tz === "") return "UTC";
  if (tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
/** The local calendar date of `d` in `tz`, "YYYY-MM-DD". */
export function localYmd(d: Date, tz: string): string {
  let f = ymdFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** tz's UTC offset (ms) at `instant`. */
function tzOffsetMs(instant: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/** The instant local midnight of `ymd` occurs in `tz`. */
export function zonedMidnight(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off = tzOffsetMs(guess, tz);
  let t = guess - off;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysYmd(ymd, -((dow + 6) % 7));
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseBound(raw: string, tz: string, isEnd: boolean): Date | null {
  if (YMD.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.toISOString().slice(0, 10) !== raw) return null; // e.g. 2026-02-31
    return zonedMidnight(isEnd ? addDaysYmd(raw, 1) : raw, tz);
  }
  if (raw.length > 40) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

export type ParsedRange = { ok: true; range: StatsRange } | { ok: false; message: string };

/**
 * Parse from/to/tz/bucket. `defaultFrom` overrides the 30-day default
 * (the question route passes the question's creation time).
 */
export function parseStatsRange(
  searchParams: URLSearchParams,
  opts: { defaultFrom?: Date; now?: Date } = {}
): ParsedRange {
  const tz = resolveTimeZone(searchParams.get("tz"));
  if (!tz) return { ok: false, message: "Invalid time zone" };
  const now = opts.now ?? new Date();

  const toRaw = searchParams.get("to");
  const to = toRaw ? parseBound(toRaw, tz, true) : now;
  if (!to) return { ok: false, message: "Invalid 'to' date" };

  const fromRaw = searchParams.get("from");
  let from: Date | null;
  if (fromRaw) from = parseBound(fromRaw, tz, false);
  else if (opts.defaultFrom) from = opts.defaultFrom;
  else from = zonedMidnight(addDaysYmd(localYmd(to, tz), -(DEFAULT_OVERVIEW_DAYS - 1)), tz);
  if (!from) return { ok: false, message: "Invalid 'from' date" };
  if (from.getTime() >= to.getTime()) {
    // A default `from` after `to` (e.g. `to` before the question existed)
    // is the caller's range, not an error: an empty one-day range.
    if (fromRaw) return { ok: false, message: "'from' must be before 'to'" };
    from = new Date(to.getTime() - DAY_MS);
  }

  const minFrom = new Date(to);
  minFrom.setUTCMonth(minFrom.getUTCMonth() - RANGE_MAX_MONTHS);
  let clamped = false;
  if (from < minFrom) {
    from = minFrom;
    clamped = true;
  }

  const bucketRaw = searchParams.get("bucket");
  let bucket: Bucket;
  if (bucketRaw === "day" || bucketRaw === "week") bucket = bucketRaw;
  else if (bucketRaw) return { ok: false, message: "Invalid bucket" };
  else bucket = to.getTime() - from.getTime() <= AUTO_WEEK_AFTER_DAYS * DAY_MS ? "day" : "week";

  return { ok: true, range: { from, to, tz, bucket, clamped } };
}

/** Every bucket key in the range, oldest first. */
export function bucketKeys(range: StatsRange): string[] {
  let cur = localYmd(range.from, range.tz);
  let last = localYmd(new Date(range.to.getTime() - 1), range.tz);
  const step = range.bucket === "week" ? 7 : 1;
  if (range.bucket === "week") {
    cur = mondayOf(cur);
    last = mondayOf(last);
  }
  const keys: string[] = [];
  // 12 months of days is ≤ 367 points; the bound is only a safety net.
  while (cur <= last && keys.length < 400) {
    keys.push(cur);
    cur = addDaysYmd(cur, step);
  }
  return keys;
}

/** The Mongo expression mapping `$createdAt` to its bucket key. */
function bucketExpr(range: StatsRange): Record<string, unknown> {
  const date =
    range.bucket === "week"
      ? {
          $dateTrunc: {
            date: "$createdAt",
            unit: "week",
            startOfWeek: "monday",
            timezone: range.tz,
          },
        }
      : "$createdAt";
  return { $dateToString: { format: "%Y-%m-%d", date, timezone: range.tz } };
}

export function rangeJson(range: StatsRange) {
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    tz: range.tz,
    bucket: range.bucket,
    clamped: range.clamped,
  };
}

export function createdAtClause(range: StatsRange) {
  return { createdAt: { $gte: range.from, $lt: range.to } };
}

// ---------------------------------------------------------------- shared aggregations

type Match = Record<string, unknown>;
type SentimentCounts = Record<AiSentiment, number>;

export interface SentimentStats {
  totals: SentimentCounts;
  trend: ({ bucket: string } & SentimentCounts)[];
}

export interface TagCount {
  tag: string;
  count: number;
}

const zeroSentiment = (): SentimentCounts =>
  Object.fromEntries(AI_SENTIMENTS.map((s) => [s, 0])) as SentimentCounts;

async function sentimentStats(match: Match, range: StatsRange): Promise<SentimentStats> {
  const rows = await MessageModel.aggregate<{ _id: { b: string; s: AiSentiment }; n: number }>([
    { $match: match },
    { $match: { "ai.sentiment": { $in: [...AI_SENTIMENTS] } } },
    { $project: { _id: 0, b: bucketExpr(range), s: "$ai.sentiment" } },
    { $group: { _id: { b: "$b", s: "$s" }, n: { $sum: 1 } } },
  ]);
  const totals = zeroSentiment();
  const byBucket = new Map<string, SentimentCounts>();
  for (const r of rows) {
    totals[r._id.s] += r.n;
    const row = byBucket.get(r._id.b) ?? zeroSentiment();
    row[r._id.s] += r.n;
    byBucket.set(r._id.b, row);
  }
  return {
    totals,
    trend: bucketKeys(range).map((bucket) => ({ bucket, ...(byBucket.get(bucket) ?? zeroSentiment()) })),
  };
}

async function topTags(match: Match): Promise<TagCount[]> {
  const rows = await MessageModel.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $match: { "ai.tags.0": { $exists: true } } },
    { $project: { _id: 0, tags: "$ai.tags" } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: TOP_TAGS },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
}

// ---------------------------------------------------------------- overview

export interface VolumePoint {
  bucket: string;
  total: number;
  question: number;
  general: number;
}

export interface OverviewAggregates {
  totals: { messages: number; question: number; general: number };
  volume: VolumePoint[];
  byTeam: { teamId: string | null; count: number }[];
  sentiment: SentimentStats;
  tags: TagCount[];
}

/** `match` must start with the org prefix (organizationId first). */
export async function overviewAggregates(match: Match, range: StatsRange): Promise<OverviewAggregates> {
  const [volumeRows, teamRows, sentiment, tags] = await Promise.all([
    MessageModel.aggregate<{ _id: string; total: number; question: number }>([
      { $match: match },
      {
        $project: {
          _id: 0,
          b: bucketExpr(range),
          q: { $cond: [{ $ifNull: ["$questionId", false] }, 1, 0] },
        },
      },
      { $group: { _id: "$b", total: { $sum: 1 }, question: { $sum: "$q" } } },
    ]),
    MessageModel.aggregate<{ _id: mongoose.Types.ObjectId | null; count: number }>([
      { $match: match },
      { $project: { _id: 0, t: { $ifNull: ["$teamId", null] } } },
      { $group: { _id: "$t", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    sentimentStats(match, range),
    topTags(match),
  ]);

  const byBucket = new Map(volumeRows.map((r) => [r._id, r]));
  const volume = bucketKeys(range).map((bucket) => {
    const r = byBucket.get(bucket);
    const total = r?.total ?? 0;
    const question = r?.question ?? 0;
    return { bucket, total, question, general: total - question };
  });
  const messages = volumeRows.reduce((s, r) => s + r.total, 0);
  const question = volumeRows.reduce((s, r) => s + r.question, 0);

  return {
    totals: { messages, question, general: messages - question },
    volume,
    byTeam: teamRows.map((r) => ({ teamId: r._id ? String(r._id) : null, count: r.count })),
    sentiment,
    tags,
  };
}

// ---------------------------------------------------------------- per question

export type Distribution =
  | { kind: "scale"; min: number; max: number; counts: { score: number; count: number }[] }
  | {
      kind: "choice";
      respondents: number;
      counts: { optionId: string; label: string; count: number }[];
    }
  | { kind: "text" };

export interface NpsStats {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoterPct: number;
  detractorPct: number;
}

export interface QuestionAggregates {
  totals: { responses: number; withComment: number; commentRate: number };
  volume: { bucket: string; count: number }[];
  distribution: Distribution;
  average: number | null;
  nps: NpsStats | null;
  sentiment: SentimentStats;
  tags: TagCount[];
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** NPS from score counts (index = score 0..10). Exported for tests. */
export function npsFromCounts(counts: { score: number; count: number }[]): NpsStats {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const { score, count } of counts) {
    if (score >= 9) promoters += count;
    else if (score >= 7) passives += count;
    else detractors += count;
  }
  const total = promoters + passives + detractors;
  if (total === 0) {
    return { score: null, promoters, passives, detractors, total, promoterPct: 0, detractorPct: 0 };
  }
  const promoterPct = (promoters * 100) / total;
  const detractorPct = (detractors * 100) / total;
  return {
    score: Math.round(promoterPct - detractorPct),
    promoters,
    passives,
    detractors,
    total,
    promoterPct: round(promoterPct, 1),
    detractorPct: round(detractorPct, 1),
  };
}

export interface QuestionForStats {
  type?: QuestionType | null;
  config?: { options?: { id: string; label: string }[] } | null;
}

/** `match` selects the question's responses (questionId + range + scope). */
export async function questionAggregates(
  question: QuestionForStats,
  match: Match,
  range: StatsRange
): Promise<QuestionAggregates> {
  const type = questionType(question);
  const commentExpr = {
    $cond: [{ $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ["$content", ""] } } } }, 0] }, 1, 0],
  };

  const distributionPipeline = isScaleType(type)
    ? [
        { $match: match },
        { $match: { "answer.kind": type, "answer.score": { $type: "number" } } },
        { $project: { _id: 0, s: "$answer.score" } },
        { $group: { _id: "$s", count: { $sum: 1 } } },
      ]
    : isChoiceType(type)
      ? [
          { $match: match },
          { $match: { "answer.kind": type } },
          { $project: { _id: 0, c: "$answer.choices" } },
          { $unwind: "$c" },
          { $group: { _id: "$c", count: { $sum: 1 } } },
        ]
      : null;

  const [volumeRows, summaryRows, distRows, sentiment, tags] = await Promise.all([
    MessageModel.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $project: { _id: 0, b: bucketExpr(range) } },
      { $group: { _id: "$b", count: { $sum: 1 } } },
    ]),
    MessageModel.aggregate<{ total: number; withComment: number; answered: number }>([
      { $match: match },
      {
        $project: {
          _id: 0,
          c: commentExpr,
          a: { $cond: [{ $eq: ["$answer.kind", type] }, 1, 0] },
        },
      },
      { $group: { _id: null, total: { $sum: 1 }, withComment: { $sum: "$c" }, answered: { $sum: "$a" } } },
    ]),
    distributionPipeline
      ? MessageModel.aggregate<{ _id: number | string; count: number }>(distributionPipeline)
      : Promise.resolve([]),
    sentimentStats(match, range),
    topTags(match),
  ]);

  const byBucket = new Map(volumeRows.map((r) => [r._id, r.count]));
  const volume = bucketKeys(range).map((bucket) => ({ bucket, count: byBucket.get(bucket) ?? 0 }));
  const summary = summaryRows[0] ?? { total: 0, withComment: 0, answered: 0 };
  const distCounts = new Map(distRows.map((r) => [r._id, r.count]));

  let distribution: Distribution = { kind: "text" };
  let average: number | null = null;
  let nps: NpsStats | null = null;
  if (isScaleType(type)) {
    const { min, max } = SCALES[type];
    const counts = [];
    for (let score = min; score <= max; score++) {
      counts.push({ score, count: distCounts.get(score) ?? 0 });
    }
    distribution = { kind: "scale", min, max, counts };
    const n = counts.reduce((s, c) => s + c.count, 0);
    average = n > 0 ? round(counts.reduce((s, c) => s + c.score * c.count, 0) / n, 2) : null;
    if (type === "nps") nps = npsFromCounts(counts);
  } else if (isChoiceType(type)) {
    // Option ids are locked once a question has answers, so current options
    // cover every answer; current labels are what the dashboard shows.
    distribution = {
      kind: "choice",
      respondents: summary.answered,
      counts: (question.config?.options ?? []).map((o) => ({
        optionId: o.id,
        label: o.label,
        count: distCounts.get(o.id) ?? 0,
      })),
    };
  }

  return {
    totals: {
      responses: summary.total,
      withComment: summary.withComment,
      commentRate: summary.total > 0 ? round(summary.withComment / summary.total, 3) : 0,
    },
    volume,
    distribution,
    average,
    nps,
    sentiment,
    tags,
  };
}

export function capProgress(q: { responseCount?: number | null; maxResponses?: number | null }) {
  const responseCount = q.responseCount ?? 0;
  const maxResponses = typeof q.maxResponses === "number" ? q.maxResponses : null;
  return {
    responseCount,
    maxResponses,
    progress: maxResponses ? round(Math.min(responseCount / maxResponses, 1), 3) : null,
  };
}
