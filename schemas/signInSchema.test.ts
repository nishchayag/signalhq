import { describe, expect, it } from "vitest";
import { signinSchema } from "@/schemas/signInSchema";

describe("signinSchema", () => {
  it("accepts and lowercases an email identifier", () => {
    const result = signinSchema.parse({
      identifier: "User@Example.com",
      password: "anything",
    });
    expect(result.identifier).toBe("user@example.com");
  });

  it("accepts and lowercases a username identifier", () => {
    const result = signinSchema.parse({
      identifier: "SomeUser1",
      password: "anything",
    });
    expect(result.identifier).toBe("someuser1");
  });

  it("rejects an identifier under 4 characters", () => {
    expect(
      signinSchema.safeParse({ identifier: "abc", password: "x" }).success
    ).toBe(false);
  });

  it("rejects an identifier that is neither a valid email nor username shape", () => {
    expect(
      signinSchema.safeParse({ identifier: "has spaces", password: "x" })
        .success
    ).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      signinSchema.safeParse({ identifier: "someuser1", password: "" })
        .success
    ).toBe(false);
  });

  it("does not enforce password complexity (only presence)", () => {
    expect(
      signinSchema.safeParse({ identifier: "someuser1", password: "x" })
        .success
    ).toBe(true);
  });
});
