import mongoose from "mongoose";
import AiUsageModel, { AI_FEATURES, type AiFeature } from "@/models/aiUsage.model";
import OrganizationModel from "@/models/organization.model";
import { PLAN_LIMITS, type Plan } from "@/lib/plans";
import { checkRateLimit } from "@/lib/rateLimit";
import { isAiEnabled } from "@/lib/ai";

export type { AiFeature };

type Id = string | mongoose.Types.ObjectId;

// Usage docs outlive their month by about a year (TTL on expiresAt).
const RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM" for the UTC calendar month containing `now`. */
export function periodOf(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodStart(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** First instant of the next UTC month — when every quota resets. */
export function nextResetAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

/** The org's billing plan (FREE if the org is missing or predates `plan`). */
export async function getOrgPlan(orgId: Id): Promise<Plan> {
  const org = await OrganizationModel.findById(orgId).select("plan").lean();
  return org?.plan ?? "FREE";
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number | null;
  // The month the units were charged to — pass it back to refundQuota so a
  // refund straddling midnight on the 1st hits the right bucket.
  period: string;
}

/**
 * Atomically take `n` units of `feature` quota for the org's current month.
 * The limit check and the increment are one conditional upsert, so parallel
 * callers can never overshoot: a doc already at the limit fails the
 * `count` filter, the upsert then tries to insert a duplicate and gets
 * E11000. E11000 also happens when two first-of-the-month calls race to
 * insert, so retry once without upsert — it increments the winner's doc if
 * there's room, or matches nothing if the quota really is exhausted.
 * A `null` limit is unlimited, but usage is still recorded.
 */
export async function consumeQuota(
  orgId: Id,
  plan: Plan,
  feature: AiFeature,
  n = 1,
  { now = new Date() }: { now?: Date } = {}
): Promise<QuotaResult> {
  const limit = PLAN_LIMITS[plan].ai[feature];
  const period = periodOf(now);
  const key = { organizationId: orgId, period, feature };

  const readUsed = async () =>
    (await AiUsageModel.findOne(key).select("count").lean())?.count ?? 0;

  // An upsert with nothing to match would insert count = n even when n
  // alone exceeds the limit.
  if (limit !== null && n > limit) {
    return { ok: false, used: await readUsed(), limit, period };
  }

  const filter = limit === null ? key : { ...key, count: { $lte: limit - n } };
  const update = {
    $inc: { count: n },
    $setOnInsert: { expiresAt: new Date(periodStart(period).getTime() + RETENTION_MS) },
  };

  let doc;
  try {
    doc = await AiUsageModel.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    doc = await AiUsageModel.findOneAndUpdate(filter, update, { new: true });
  }
  if (!doc) return { ok: false, used: await readUsed(), limit, period };
  return { ok: true, used: doc.count, limit, period };
}

/**
 * Give back units taken by consumeQuota when the AI call failed. Never takes
 * the counter below zero (the `$gte` guard makes an over-refund a no-op).
 */
export async function refundQuota(
  orgId: Id,
  feature: AiFeature,
  n = 1,
  { period = periodOf() }: { period?: string } = {}
): Promise<void> {
  await AiUsageModel.updateOne(
    { organizationId: orgId, period, feature, count: { $gte: n } },
    { $inc: { count: -n } }
  );
}

export interface QuotaStatus {
  usage: Record<AiFeature, { used: number; limit: number | null }>;
  resetsAt: Date;
}

/** Current-month usage and limit for every AI feature. */
export async function quotaStatus(
  orgId: Id,
  plan: Plan,
  { now = new Date() }: { now?: Date } = {}
): Promise<QuotaStatus> {
  const docs = await AiUsageModel.find({ organizationId: orgId, period: periodOf(now) })
    .select("feature count")
    .lean();
  const used = new Map(docs.map((d) => [d.feature, d.count]));
  const usage = Object.fromEntries(
    AI_FEATURES.map((f) => [f, { used: used.get(f) ?? 0, limit: PLAN_LIMITS[plan].ai[f] }])
  ) as QuotaStatus["usage"];
  return { usage, resetsAt: nextResetAt(now) };
}

/** Whether the public anonymity guard has quota left this month (read-only). */
export async function guardAvailable(
  orgId: Id,
  plan: Plan,
  { now = new Date() }: { now?: Date } = {}
): Promise<boolean> {
  const limit = PLAN_LIMITS[plan].ai.guard;
  if (limit === null) return true;
  const doc = await AiUsageModel.findOne({
    organizationId: orgId,
    period: periodOf(now),
    feature: "guard",
  })
    .select("count")
    .lean();
  return (doc?.count ?? 0) < limit;
}

/**
 * The public `guardAvailable` flag the /o pages and the public question GET
 * hand to their forms: AI is configured and the org still has guard quota.
 * A plain boolean on purpose — public surfaces never see usage numbers.
 */
export async function isGuardOffered(orgId: Id): Promise<boolean> {
  if (!isAiEnabled()) return false;
  return guardAvailable(orgId, await getOrgPlan(orgId));
}

/**
 * Deployment-wide daily ceiling across every org, protecting the shared
 * (free-tier) provider key. Counts a hit on every call — check it right
 * before the AI call, after the per-org quota passed.
 */
export async function checkGlobalAiCap(): Promise<boolean> {
  return checkRateLimit(
    "ai:global",
    Number(process.env.AI_GLOBAL_DAILY_CAP ?? 3000),
    DAY_MS
  );
}
