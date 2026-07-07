import { describe, expect, it } from "vitest";
import { updateMemberRoleSchema } from "@/schemas/memberSchema";

describe("updateMemberRoleSchema", () => {
  it("accepts ADMIN and MEMBER", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "ADMIN" }).success).toBe(
      true
    );
    expect(updateMemberRoleSchema.safeParse({ role: "MEMBER" }).success).toBe(
      true
    );
  });

  it("rejects OWNER (ownership transfer is a separate, deliberate action)", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "OWNER" }).success).toBe(
      false
    );
  });

  it("rejects an unrecognized role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "SUPERADMIN" }).success).toBe(
      false
    );
  });
});
