import { describe, expect, it } from "vitest";
import { createTeamSchema, updateTeamSchema } from "@/schemas/teamSchema";

describe("createTeamSchema", () => {
  it("accepts a valid name", () => {
    expect(createTeamSchema.safeParse({ name: "Engineering" }).success).toBe(
      true
    );
  });

  it("trims the name", () => {
    expect(createTeamSchema.parse({ name: "  Engineering  " }).name).toBe(
      "Engineering"
    );
  });

  it("rejects a name under 2 characters", () => {
    expect(createTeamSchema.safeParse({ name: "E" }).success).toBe(false);
  });

  it("rejects a name over 100 characters", () => {
    expect(createTeamSchema.safeParse({ name: "a".repeat(101) }).success).toBe(
      false
    );
  });
});

describe("updateTeamSchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    expect(updateTeamSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a memberIds array of strings", () => {
    expect(
      updateTeamSchema.safeParse({ memberIds: ["a", "b"] }).success
    ).toBe(true);
  });

  it("rejects a memberIds array containing non-strings", () => {
    expect(
      updateTeamSchema.safeParse({ memberIds: [1, 2] }).success
    ).toBe(false);
  });

  it("rejects a name under 2 characters when provided", () => {
    expect(updateTeamSchema.safeParse({ name: "E" }).success).toBe(false);
  });
});
