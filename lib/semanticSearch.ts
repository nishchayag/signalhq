import mongoose from "mongoose";
import { NextResponse } from "next/server";
import MessageModel from "@/models/message.model";
import type { MembershipRole } from "@/models/membership.model";
import { aiEmbed, isAiEnabled, logAiError } from "@/lib/ai";
import { checkGlobalAiCap, consumeQuota, getOrgPlan, refundQuota } from "@/lib/aiQuota";
import type { Plan } from "@/lib/plans";
import { checkRateLimit } from "@/lib/rateLimit";
import { withAiView } from "@/lib/messageView";

// Semantic search over a caller-scoped set of messages.
//
// M0 (default): Atlas M0 has no vector index, so the query is embedded and
// compared in-app against the `candidateCap` most recent embedded messages
// inside the caller's filter. The filter is built by the route (org + team
// scope + question/general + no member threads), so scoping is exactly the
// regex path's and can't drift.
//
// $vectorSearch: only when ATLAS_VECTOR_INDEX names an Atlas Vector Search
// index on the messages collection. Expected index definition:
//   {
//     "fields": [
//       { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" },
//       { "type": "filter", "path": "organizationId" },
//       { "type": "filter", "path": "questionId" }
//     ]
//   }
// The index can only pre-filter on organizationId + questionId, so results
// are post-filtered through the full scoped filter when hydrated.

export const SEMANTIC_LIMIT = 20;
export const SEMANTIC_CANDIDATE_CAP = 1000;
export const SEMANTIC_MIN_QUERY = 3;
const QUERY_EMBED_TIMEOUT_MS = 8_000;
const SEARCH_RATE_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 10 * 60 * 1000;

/** Default cosine threshold; override with SEMANTIC_MIN_SCORE. */
export function defaultMinScore(): number {
  const raw = Number(process.env.SEMANTIC_MIN_SCORE);
  return Number.isFinite(raw) && process.env.SEMANTIC_MIN_SCORE ? raw : 0.7;
}

export type SearchStrategy = "scan" | "vectorSearch";

export function chooseStrategy(): SearchStrategy {
  return process.env.ATLAS_VECTOR_INDEX ? "vectorSearch" : "scan";
}

export type SemanticSearchResult =
  | { ok: true; messages: unknown[]; truncated: boolean; semantic: true }
  | { ok: false; reason: "quota"; used: number; limit: number | null }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "embed_failed" };

interface SemanticSearchOpts {
  filter: Record<string, unknown>;
  queryText: string;
  orgId: string | mongoose.Types.ObjectId;
  plan: Plan;
  limit?: number;
  candidateCap?: number;
  minScore?: number;
}

function norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Cosine similarity with a precomputed query norm. 0 on a length mismatch. */
export function cosine(q: Float32Array, qNorm: number, d: Float32Array): number {
  if (d.length !== q.length || qNorm === 0) return 0;
  let dot = 0;
  let dd = 0;
  for (let i = 0; i < q.length; i++) {
    const x = d[i];
    dot += q[i] * x;
    dd += x * x;
  }
  return dd === 0 ? 0 : dot / (qNorm * Math.sqrt(dd));
}

// The raw driver doesn't cast (string ids stay strings and match nothing),
// so run the scoped filter through Mongoose's caster first.
function castFilter(filter: Record<string, unknown>): Record<string, unknown> {
  return MessageModel.find().cast(MessageModel, { ...filter }) as Record<string, unknown>;
}

function toVector(raw: unknown): Float32Array | null {
  if (raw && typeof (raw as { toFloat32Array?: unknown }).toFloat32Array === "function") {
    try {
      return (raw as mongoose.mongo.Binary).toFloat32Array();
    } catch {
      return null;
    }
  }
  return null;
}

async function scanCandidates(
  filter: Record<string, unknown>,
  q: Float32Array,
  { limit, candidateCap, minScore }: { limit: number; candidateCap: number; minScore: number }
): Promise<{ ranked: { id: mongoose.Types.ObjectId; score: number }[]; truncated: boolean }> {
  const docs = await MessageModel.collection
    .find(
      { ...castFilter(filter), embedding: { $exists: true } },
      { projection: { embedding: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(candidateCap)
    .toArray();

  const qNorm = norm(q);
  const scored: { id: mongoose.Types.ObjectId; score: number }[] = [];
  for (const doc of docs) {
    const v = toVector(doc.embedding);
    if (!v) continue;
    const score = cosine(q, qNorm, v);
    if (score >= minScore) scored.push({ id: doc._id as mongoose.Types.ObjectId, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { ranked: scored.slice(0, limit), truncated: docs.length === candidateCap };
}

async function vectorSearchCandidates(
  filter: Record<string, unknown>,
  q: Float32Array,
  { limit, minScore }: { limit: number; minScore: number }
): Promise<{ id: mongoose.Types.ObjectId; score: number }[]> {
  const casted = castFilter(filter);
  const pre: Record<string, unknown> = {};
  if ("organizationId" in casted) pre.organizationId = casted.organizationId;
  if ("questionId" in casted) pre.questionId = casted.questionId;
  const docs = await MessageModel.collection
    .aggregate([
      {
        $vectorSearch: {
          index: process.env.ATLAS_VECTOR_INDEX,
          path: "embedding",
          queryVector: Array.from(q),
          numCandidates: 200,
          limit: SEMANTIC_LIMIT,
          filter: pre,
        },
      },
      { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
    ])
    .toArray();
  // Atlas normalises cosine to (1 + cos) / 2; map back so SEMANTIC_MIN_SCORE
  // means the same thing on both paths.
  return docs
    .map((d) => ({ id: d._id as mongoose.Types.ObjectId, score: 2 * Number(d.score) - 1 }))
    .filter((d) => d.score >= minScore)
    .slice(0, limit);
}

/**
 * Charge one "search" unit, embed the query, rank scoped messages by cosine
 * similarity and hydrate the top `limit` (with "+ai", in score order — the
 * caller passes them through withAiView). Never returns embeddings.
 */
export async function semanticSearch({
  filter,
  queryText,
  orgId,
  plan,
  limit = SEMANTIC_LIMIT,
  candidateCap = SEMANTIC_CANDIDATE_CAP,
  minScore = defaultMinScore(),
}: SemanticSearchOpts): Promise<SemanticSearchResult> {
  const quota = await consumeQuota(orgId, plan, "search");
  if (!quota.ok) return { ok: false, reason: "quota", used: quota.used, limit: quota.limit };
  const refund = () => refundQuota(orgId, "search", 1, { period: quota.period });

  if (!(await checkGlobalAiCap())) {
    await refund();
    return { ok: false, reason: "unavailable" };
  }

  let q: Float32Array | undefined;
  try {
    [q] = await aiEmbed([queryText.slice(0, 500)], QUERY_EMBED_TIMEOUT_MS);
  } catch (err) {
    logAiError("search", err);
  }
  if (!q || q.length === 0) {
    await refund();
    return { ok: false, reason: "embed_failed" };
  }

  let ranked: { id: mongoose.Types.ObjectId; score: number }[];
  let truncated = false;
  if (chooseStrategy() === "vectorSearch") {
    ranked = await vectorSearchCandidates(filter, q, { limit, minScore });
  } else {
    ({ ranked, truncated } = await scanCandidates(filter, q, { limit, candidateCap, minScore }));
  }

  if (ranked.length === 0) return { ok: true, messages: [], truncated, semantic: true };

  // Re-apply the full scoped filter: the $vectorSearch pre-filter is coarser.
  const docs = await MessageModel.find({ ...filter, _id: { $in: ranked.map((r) => r.id) } }).select(
    "+ai"
  );
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const messages = ranked.map((r) => byId.get(String(r.id))).filter(Boolean) as unknown[];
  return { ok: true, messages, truncated, semantic: true };
}

/** `?mode=semantic` on a list route. */
export function isSemanticRequest(url: string): boolean {
  return new URL(url).searchParams.get("mode") === "semantic";
}

/**
 * The shared `mode=semantic` handler for getMessages and questions/[id] GET.
 * The caller has already authenticated and authorized (message:read) and
 * built the scoped filter. Returns the list-route body fields
 * (`messages`, `hasMore: false`, `nextCursor: null`, `semantic`, `truncated`)
 * or an error response.
 */
export async function semanticListResponse({
  url,
  userId,
  role,
  orgId,
  filter,
  extra = {},
}: {
  url: string;
  userId: string;
  role: MembershipRole | null;
  orgId: string | mongoose.Types.ObjectId | null | undefined;
  filter: Record<string, unknown>;
  extra?: Record<string, unknown>;
}): Promise<NextResponse> {
  if (!isAiEnabled()) {
    return NextResponse.json(
      { success: false, message: "Semantic search is not configured on this server." },
      { status: 503 }
    );
  }
  if (!orgId) {
    return NextResponse.json(
      { success: false, message: "Semantic search isn't available here" },
      { status: 400 }
    );
  }
  const params = new URL(url).searchParams;
  const queryText = (params.get("q") ?? params.get("search") ?? "").trim();
  if (queryText.length < SEMANTIC_MIN_QUERY) {
    return NextResponse.json(
      {
        success: false,
        message: `Semantic search needs at least ${SEMANTIC_MIN_QUERY} characters`,
      },
      { status: 400 }
    );
  }
  if (!(await checkRateLimit(`search:${userId}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS))) {
    return NextResponse.json(
      { success: false, message: "Too many searches. Please try again later." },
      { status: 429 }
    );
  }

  const result = await semanticSearch({
    filter: { ...filter, authorType: { $ne: "member" } },
    queryText,
    orgId,
    plan: await getOrgPlan(orgId),
  });
  if (!result.ok) {
    if (result.reason === "quota") {
      return NextResponse.json(
        {
          success: false,
          code: "AI_QUOTA_EXHAUSTED",
          message: "Your organization's monthly semantic search limit has been reached.",
          usage: { used: result.used, limit: result.limit },
        },
        { status: 429 }
      );
    }
    if (result.reason === "unavailable") {
      return NextResponse.json(
        { success: false, message: "Semantic search is temporarily unavailable." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, message: "Semantic search failed. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    ...extra,
    messages: withAiView(result.messages, role),
    hasMore: false,
    nextCursor: null,
    semantic: true,
    truncated: result.truncated,
  });
}
