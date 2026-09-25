import { describe, expect, it } from "vitest";
import { hasFeature, PLAN_FEATURES } from "@/lib/plans";

describe("PLAN_FEATURES / hasFeature", () => {
  it("branding is PRO and ENTERPRISE only, not FREE", () => {
    expect(hasFeature("FREE", "branding")).toBe(false);
    expect(hasFeature("PRO", "branding")).toBe(true);
    expect(hasFeature("ENTERPRISE", "branding")).toBe(true);
  });

  it("matches PLAN_FEATURES directly for every plan", () => {
    for (const plan of ["FREE", "PRO", "ENTERPRISE"] as const) {
      expect(hasFeature(plan, "branding")).toBe(PLAN_FEATURES[plan].branding);
    }
  });
});
