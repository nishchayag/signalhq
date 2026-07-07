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

  it("rejects an email with surrounding whitespace", () => {
    // .email() runs before .trim() in the chain, so padded input fails
    // format validation before the trim step ever applies — pinning this
    // order-dependent quirk rather than assuming trim-then-validate.
    expect(
      createInvitationSchema.safeParse({ email: "  a@b.com  " }).success
    ).toBe(false);
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
