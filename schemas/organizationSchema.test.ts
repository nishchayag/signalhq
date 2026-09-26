import { describe, expect, it } from "vitest";
import {
  createOrganizationSchema,
  renameOrganizationSchema,
  transferOwnershipSchema,
  updatePlanSchema,
} from "@/schemas/organizationSchema";

describe.each([
  ["createOrganizationSchema", createOrganizationSchema],
  ["renameOrganizationSchema", renameOrganizationSchema],
])("%s", (_name, schema) => {
  it("accepts a valid name", () => {
    expect(schema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("trims the name", () => {
    expect(schema.parse({ name: "  Acme  " }).name).toBe("Acme");
  });

  it("rejects a name under 2 characters", () => {
    expect(schema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("rejects a name over 80 characters", () => {
    expect(schema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
  });

  it("rejects a name containing a newline", () => {
    const result = schema.safeParse({ name: "Acme\nBcc: x@y" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Organization name contains invalid characters"
      );
    }
  });

  it("rejects a name containing a tab or NUL byte", () => {
    expect(schema.safeParse({ name: "Acme\tCorp" }).success).toBe(false);
    expect(schema.safeParse({ name: "Acme\u0000Corp" }).success).toBe(false);
  });

  it("accepts Unicode names with emoji", () => {
    expect(schema.safeParse({ name: "José's Café 🚀" }).success).toBe(true);
  });
});

describe("updatePlanSchema", () => {
  it.each(["FREE", "PRO", "ENTERPRISE"])("accepts %s", (plan) => {
    expect(updatePlanSchema.safeParse({ plan }).success).toBe(true);
  });

  it("rejects an unrecognized plan", () => {
    expect(updatePlanSchema.safeParse({ plan: "ULTRA" }).success).toBe(false);
  });
});

describe("transferOwnershipSchema", () => {
  it("accepts a non-empty membershipId", () => {
    expect(
      transferOwnershipSchema.safeParse({ membershipId: "abc" }).success
    ).toBe(true);
  });

  it("rejects an empty membershipId", () => {
    expect(
      transferOwnershipSchema.safeParse({ membershipId: "" }).success
    ).toBe(false);
  });
});
