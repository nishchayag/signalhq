import { describe, expect, it } from "vitest";
import {
  createQuestionSchema,
  questionResponseSchema,
  updateQuestionSchema,
} from "@/schemas/questionSchema";

describe("createQuestionSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      createQuestionSchema.safeParse({ questionText: "Tell me feedback" })
        .success
    ).toBe(true);
  });

  it("trims questionText", () => {
    expect(
      createQuestionSchema.parse({ questionText: "  Tell me feedback  " })
        .questionText
    ).toBe("Tell me feedback");
  });

  it("rejects questionText under 10 characters", () => {
    expect(
      createQuestionSchema.safeParse({ questionText: "short" }).success
    ).toBe(false);
  });

  it("rejects questionText over 500 characters", () => {
    expect(
      createQuestionSchema.safeParse({ questionText: "a".repeat(501) })
        .success
    ).toBe(false);
  });

  it("rejects a description over 1000 characters", () => {
    expect(
      createQuestionSchema.safeParse({
        questionText: "Tell me feedback",
        description: "a".repeat(1001),
      }).success
    ).toBe(false);
  });

  it.each(["public", "internal"])("accepts visibility %s", (visibility) => {
    expect(
      createQuestionSchema.safeParse({
        questionText: "Tell me feedback",
        visibility,
      }).success
    ).toBe(true);
  });

  it("rejects an unrecognized visibility", () => {
    expect(
      createQuestionSchema.safeParse({
        questionText: "Tell me feedback",
        visibility: "hidden",
      }).success
    ).toBe(false);
  });
});

describe("updateQuestionSchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    expect(updateQuestionSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a questionText under 10 characters when provided", () => {
    expect(
      updateQuestionSchema.safeParse({ questionText: "short" }).success
    ).toBe(false);
  });

  it("accepts isActive as a boolean", () => {
    expect(updateQuestionSchema.safeParse({ isActive: false }).success).toBe(
      true
    );
  });

  it("rejects isActive as a non-boolean", () => {
    expect(
      updateQuestionSchema.safeParse({ isActive: "false" }).success
    ).toBe(false);
  });
});

describe("questionResponseSchema", () => {
  it("accepts non-empty content", () => {
    expect(questionResponseSchema.safeParse({ content: "Nice work" }).success).toBe(
      true
    );
  });

  it("trims content", () => {
    expect(
      questionResponseSchema.parse({ content: "  Nice work  " }).content
    ).toBe("Nice work");
  });

  it("rejects empty content", () => {
    expect(questionResponseSchema.safeParse({ content: "" }).success).toBe(
      false
    );
  });

  it("rejects content over 1000 characters", () => {
    expect(
      questionResponseSchema.safeParse({ content: "a".repeat(1001) }).success
    ).toBe(false);
  });
});
