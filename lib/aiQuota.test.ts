import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  checkGlobalAiCap,
  consumeQuota,
  getOrgPlan,
  guardAvailable,
  nextResetAt,
  periodOf,
  quotaStatus,
  refundQuota,
} from "@/lib/aiQuota";
import { PLAN_LIMITS } from "@/lib/plans";
import AiUsageModel from "@/models/aiUsage.model";
import OrganizationModel from "@/models/organization.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  delete process.env.AI_GLOBAL_DAILY_CAP;
});
afterAll(stopTestDB);

const SEPT = new Date("2026-09-15T12:00:00Z");
const oid = () => new mongoose.Types.ObjectId();

describe("period helpers", () => {
  it("uses UTC calendar months", () => {
    expect(periodOf(new Date("2026-09-30T23:59:59Z"))).toBe("2026-09");
    expect(periodOf(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
    expect(nextResetAt(SEPT).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextResetAt(new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("consumeQuota", () => {
  it("consumes up to the plan limit, then refuses", async () => {
    const org = oid();
    const limit = PLAN_LIMITS.FREE.ai.insights!; // 10
    for (let i = 1; i <= limit; i++) {
      const r = await consumeQuota(org, "FREE", "insights", 1, { now: SEPT });
      expect(r).toEqual({ ok: true, used: i, limit, period: "2026-09" });
    }
    const refused = await consumeQuota(org, "FREE", "insights", 1, { now: SEPT });
    expect(refused).toEqual({ ok: false, used: limit, limit, period: "2026-09" });
    expect((await AiUsageModel.findOne({ organizationId: org }))!.count).toBe(limit);
  });

  it("refuses a batch that would overshoot, even on a fresh counter", async () => {
    const org = oid();
    expect((await consumeQuota(org, "FREE", "insights", 11, { now: SEPT })).ok).toBe(false);
    expect(await AiUsageModel.countDocuments({ organizationId: org })).toBe(0);
    await consumeQuota(org, "FREE", "insights", 8, { now: SEPT });
    expect((await consumeQuota(org, "FREE", "insights", 3, { now: SEPT })).ok).toBe(false);
    expect((await consumeQuota(org, "FREE", "insights", 2, { now: SEPT })).ok).toBe(true);
  });

  it("keeps features and orgs in separate buckets", async () => {
    const [a, b] = [oid(), oid()];
    for (let i = 0; i < 10; i++) await consumeQuota(a, "FREE", "insights", 1, { now: SEPT });
    expect((await consumeQuota(a, "FREE", "insights", 1, { now: SEPT })).ok).toBe(false);
    expect((await consumeQuota(a, "FREE", "draft", 1, { now: SEPT })).ok).toBe(true);
    expect((await consumeQuota(b, "FREE", "insights", 1, { now: SEPT })).ok).toBe(true);
  });

  it("20 parallel consumes at a limit of 5 give exactly 5", async () => {
    const org = oid();
    const original = PLAN_LIMITS.FREE.ai.insights;
    PLAN_LIMITS.FREE.ai.insights = 5;
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => consumeQuota(org, "FREE", "insights", 1, { now: SEPT }))
      );
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect((await AiUsageModel.findOne({ organizationId: org }))!.count).toBe(5);
    } finally {
      PLAN_LIMITS.FREE.ai.insights = original;
    }
  });

  it("starts fresh in a new month", async () => {
    const org = oid();
    for (let i = 0; i < 10; i++) await consumeQuota(org, "FREE", "insights", 1, { now: SEPT });
    expect((await consumeQuota(org, "FREE", "insights", 1, { now: SEPT })).ok).toBe(false);

    const oct = new Date("2026-10-01T00:00:01Z");
    expect(await consumeQuota(org, "FREE", "insights", 1, { now: oct })).toEqual({
      ok: true,
      used: 1,
      limit: 10,
      period: "2026-10",
    });
  });

  it("sets expiresAt about 400 days after the period starts", async () => {
    const org = oid();
    await consumeQuota(org, "FREE", "suggest", 1, { now: SEPT });
    const doc = await AiUsageModel.findOne({ organizationId: org });
    const days = (doc!.expiresAt.getTime() - Date.UTC(2026, 8, 1)) / 86_400_000;
    expect(days).toBe(400);
  });

  it("treats a null limit as unlimited but still records usage", async () => {
    const org = oid();
    expect(PLAN_LIMITS.ENTERPRISE.ai.insights).toBeNull();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => consumeQuota(org, "ENTERPRISE", "insights", 1, { now: SEPT }))
    );
    expect(results.every((r) => r.ok && r.limit === null)).toBe(true);
    expect((await AiUsageModel.findOne({ organizationId: org }))!.count).toBe(15);
  });
});

describe("refundQuota", () => {
  it("gives units back and never goes below zero", async () => {
    const org = oid();
    for (let i = 0; i < 10; i++) await consumeQuota(org, "FREE", "insights", 1, { now: SEPT });
    await refundQuota(org, "insights", 1, { period: "2026-09" });
    expect((await consumeQuota(org, "FREE", "insights", 1, { now: SEPT })).ok).toBe(true);

    await refundQuota(org, "insights", 10, { period: "2026-09" });
    await refundQuota(org, "insights", 1, { period: "2026-09" }); // count is 0: no-op
    expect((await AiUsageModel.findOne({ organizationId: org }))!.count).toBe(0);
  });

  it("is a no-op when nothing was consumed", async () => {
    await refundQuota(oid(), "draft");
    expect(await AiUsageModel.countDocuments()).toBe(0);
  });
});

describe("quotaStatus / guardAvailable", () => {
  it("reports every feature with its limit and the reset date", async () => {
    const org = oid();
    await consumeQuota(org, "PRO", "draft", 3, { now: SEPT });
    const status = await quotaStatus(org, "PRO", { now: SEPT });
    expect(status.resetsAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(status.usage.draft).toEqual({ used: 3, limit: 500 });
    expect(status.usage.suggest).toEqual({ used: 0, limit: 300 });
    expect(Object.keys(status.usage).sort()).toEqual(
      ["digest", "draft", "enrich", "guard", "insights", "search", "suggest"]
    );
  });

  it("guard is available until the monthly guard quota is used up", async () => {
    const org = oid();
    expect(await guardAvailable(org, "FREE", { now: SEPT })).toBe(true);
    await consumeQuota(org, "FREE", "guard", PLAN_LIMITS.FREE.ai.guard!, { now: SEPT });
    expect(await guardAvailable(org, "FREE", { now: SEPT })).toBe(false);
    expect(await guardAvailable(org, "ENTERPRISE", { now: SEPT })).toBe(true);
  });
});

describe("getOrgPlan", () => {
  it("reads the org's plan, defaulting to FREE", async () => {
    const org = await OrganizationModel.create({ name: "A", slug: "a", createdBy: oid(), plan: "PRO" });
    expect(await getOrgPlan(org._id)).toBe("PRO");
    expect(await getOrgPlan(oid())).toBe("FREE");
  });
});

describe("checkGlobalAiCap", () => {
  it("allows calls up to AI_GLOBAL_DAILY_CAP per day", async () => {
    process.env.AI_GLOBAL_DAILY_CAP = "2";
    expect(await checkGlobalAiCap()).toBe(true);
    expect(await checkGlobalAiCap()).toBe(true);
    expect(await checkGlobalAiCap()).toBe(false);
  });
});
