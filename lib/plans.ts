import type { OrganizationPlan } from "@/models/organization.model";

export type Plan = OrganizationPlan;

export const PLAN_ORDER: Plan[] = ["FREE", "PRO", "ENTERPRISE"];

/**
 * Per-tier feature limits. `maxTeams: null` means unlimited.
 *
 * No price is decided yet (pre-payment, early-access stage), but these
 * limits are enforced now so the gating logic is already correct once
 * pricing goes live — see app/api/organizations/[orgId]/teams/route.ts and
 * app/api/organizations/[orgId]/plan/route.ts.
 */
export const PLAN_LIMITS: Record<Plan, { maxTeams: number | null }> = {
  FREE: { maxTeams: 2 },
  PRO: { maxTeams: 10 },
  ENTERPRISE: { maxTeams: null },
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
      "Community support",
    ],
  },
  PRO: {
    name: "Pro",
    tagline: "For growing organizations",
    features: ["Up to 10 teams", "Priority support", "Everything in Free"],
  },
  ENTERPRISE: {
    name: "Enterprise",
    tagline: "For large organizations",
    features: ["Unlimited teams", "Dedicated support", "Everything in Pro"],
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
