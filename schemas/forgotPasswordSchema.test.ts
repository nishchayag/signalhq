import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/schemas/forgotPasswordSchema";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(
      true
    );
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(
      false
    );
  });
});

describe("resetPasswordSchema", () => {
  const base = {
    email: "a@b.com",
    otpCode: "123456",
    newPassword: "Abcdefg1!",
  };

  it("accepts a fully valid payload", () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an otpCode that isn't exactly 6 digits", () => {
    expect(
      resetPasswordSchema.safeParse({ ...base, otpCode: "12345" }).success
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, otpCode: "1234567" }).success
    ).toBe(false);
  });

  it("rejects a non-numeric otpCode", () => {
    expect(
      resetPasswordSchema.safeParse({ ...base, otpCode: "abcdef" }).success
    ).toBe(false);
  });

  it("rejects a newPassword failing the complexity rule", () => {
    expect(
      resetPasswordSchema.safeParse({ ...base, newPassword: "alllowercase1!" })
        .success
    ).toBe(false);
  });
});
