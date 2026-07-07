import { describe, expect, it } from "vitest";
import { verifySchema } from "@/schemas/verifySchema";

describe("verifySchema", () => {
  it("accepts a 6-digit code", () => {
    expect(verifySchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it("rejects a code that isn't exactly 6 digits", () => {
    expect(verifySchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(verifySchema.safeParse({ code: "1234567" }).success).toBe(false);
  });

  it("rejects a non-numeric code", () => {
    expect(verifySchema.safeParse({ code: "abcdef" }).success).toBe(false);
  });
});
