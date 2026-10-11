import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  createInvitationSchema,
} from "@/schemas/invitationSchema";

describe("createInvitationSchema", () => {
  it("accepts a valid email and role", () => {
    const result = createInvitationSchema.safeParse({
      email: "a@b.com",
      role: "ADMIN",
    });
    expect(result.success).toBe(true);
  });

  it("defaults role to MEMBER when omitted", () => {
    const result = createInvitationSchema.parse({ email: "a@b.com" });
    expect(result.role).toBe("MEMBER");
  });

  it("trims surrounding whitespace before validating the email", () => {
    const result = createInvitationSchema.safeParse({ email: "  a@b.com  " });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("a@b.com");
  });

  it("rejects an invalid email", () => {
    expect(
      createInvitationSchema.safeParse({ email: "nope" }).success
    ).toBe(false);
  });

  it("rejects OWNER as a role (never assignable via invitation)", () => {
    expect(
      createInvitationSchema.safeParse({ email: "a@b.com", role: "OWNER" })
        .success
    ).toBe(false);
  });

  it("accepts an optional teamId", () => {
    expect(
      createInvitationSchema.safeParse({ email: "a@b.com", teamId: "abc" })
        .success
    ).toBe(true);
  });
});

describe("acceptInvitationSchema", () => {
  it("accepts a non-empty token", () => {
    expect(acceptInvitationSchema.safeParse({ token: "tok" }).success).toBe(
      true
    );
  });

  it("rejects an empty token", () => {
    expect(acceptInvitationSchema.safeParse({ token: "" }).success).toBe(
      false
    );
  });
});
