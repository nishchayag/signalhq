import type { OrganizationPlan } from "@/models/organization.model";
import type { AiFeature } from "@/models/aiUsage.model";

export type Plan = OrganizationPlan;

export const PLAN_ORDER: Plan[] = ["FREE", "PRO", "ENTERPRISE"];

/** Monthly AI calls per org, per feature. `null` means unlimited. */
export type AiLimits = Record<AiFeature, number | null>;

/**
 * Per-tier feature limits. `null` means unlimited (`maxTeams`, and each
 * monthly AI quota in `ai` — enforced by lib/aiQuota.ts). `digest` is one
 * AI summary per day, so it's the same on every plan.
 *
 * No price is decided yet (pre-payment, early-access stage), but these
 * limits are enforced now so the gating logic is already correct once
 * pricing goes live — see app/api/organizations/[orgId]/teams/route.ts and
 * app/api/organizations/[orgId]/plan/route.ts.
 */
export const PLAN_LIMITS: Record<
  Plan,
  { maxTeams: number | null; ai: AiLimits }
> = {
  FREE: {
    maxTeams: 2,
    ai: { suggest: 30, enrich: 300, insights: 10, draft: 30, guard: 150, search: 100, digest: 31 },
  },
  PRO: {
    maxTeams: 10,
    ai: { suggest: 300, enrich: 5000, insights: 150, draft: 500, guard: 3000, search: 2000, digest: 31 },
  },
  ENTERPRISE: {
    maxTeams: null,
    ai: { suggest: null, enrich: null, insights: null, draft: null, guard: null, search: null, digest: 31 },
  },
};

export const PLAN_DISPLAY: Record<
  Plan,
  { name: string; tagline: string; features: string[] }
> = {
  FREE: {
    name: "Free",
    tagline: "Get started with a single team",
    features: [
      "Up to 2 teams",
      "Unlimited anonymous feedback",
      "AI assist with monthly limits",
      "Community support",
    ],
  },
  PRO: {
    name: "Pro",
    tagline: "For growing organizations",
    features: [
      "Up to 10 teams",
      "10x higher AI limits",
      "Priority support",
      "Everything in Free",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    tagline: "For large organizations",
    features: [
      "Unlimited teams",
      "Unlimited AI features",
      "Dedicated support",
      "Everything in Pro",
    ],
  },
};

/** True if `currentTeamCount` is already at or over `plan`'s team limit. */
export function teamLimitReached(
  plan: Plan,
  currentTeamCount: number
): boolean {
  const limit = PLAN_LIMITS[plan].maxTeams;
  return limit !== null && currentTeamCount >= limit;
}
