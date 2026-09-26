import { describe, expect, it } from "vitest";
import {
  nameValidation,
  passwordValidation,
  signupSchema,
  usernameValidation,
} from "@/schemas/signUpSchema";

describe("usernameValidation", () => {
  it("accepts a valid username and lowercases it", () => {
    expect(usernameValidation.parse("SomeUser_1")).toBe("someuser_1");
  });

  it("rejects a username under 4 characters", () => {
    expect(usernameValidation.safeParse("abc").success).toBe(false);
  });

  it("rejects a username over 20 characters", () => {
    expect(usernameValidation.safeParse("a".repeat(21)).success).toBe(false);
  });

  it("rejects characters outside [a-z0-9_]", () => {
    expect(usernameValidation.safeParse("user-name").success).toBe(false);
    expect(usernameValidation.safeParse("user name").success).toBe(false);
  });
});

describe("nameValidation", () => {
  it("accepts names with letters, spaces, apostrophes, periods and hyphens", () => {
    expect(nameValidation.safeParse("José O'Brien-Smith").success).toBe(true);
  });

  it("rejects a name containing a newline (would leak into the personal org name)", () => {
    expect(nameValidation.safeParse("Acme\nBcc: x@y").success).toBe(false);
  });

  it("rejects a name containing a tab or NUL byte", () => {
    expect(nameValidation.safeParse("Jane\tDoe").success).toBe(false);
    expect(nameValidation.safeParse("Jane\u0000Doe").success).toBe(false);
  });
});

describe("passwordValidation", () => {
  it("accepts a password with upper, lower, digit, and special char", () => {
    expect(passwordValidation.safeParse("Abcdefg1!").success).toBe(true);
  });

  it("rejects a password missing an uppercase letter", () => {
    expect(passwordValidation.safeParse("abcdefg1!").success).toBe(false);
  });

  it("rejects a password missing a lowercase letter", () => {
    expect(passwordValidation.safeParse("ABCDEFG1!").success).toBe(false);
  });

  it("rejects a password missing a digit", () => {
    expect(passwordValidation.safeParse("Abcdefgh!").success).toBe(false);
  });

  it("rejects a password missing a special character", () => {
    expect(passwordValidation.safeParse("Abcdefg12").success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(passwordValidation.safeParse("Ab1!").success).toBe(false);
  });
});

describe("signupSchema", () => {
  const valid = {
    username: "gooduser",
    email: "a@b.com",
    name: "Jane",
    password: "Abcdefg1!",
    confirmPassword: "Abcdefg1!",
  };

  it("accepts a fully valid payload", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("does not itself enforce password === confirmPassword", () => {
    // confirmPassword is unconstrained at the schema level (checked
    // elsewhere, e.g. with .refine in the calling form) — this pins that
    // behavior so a future schema change is a deliberate decision.
    expect(
      signupSchema.safeParse({ ...valid, confirmPassword: "somethingElse" })
        .success
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(signupSchema.safeParse({ ...valid, email: "nope" }).success).toBe(
      false
    );
  });

  it("rejects an empty name", () => {
    expect(signupSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false
    );
  });
});
