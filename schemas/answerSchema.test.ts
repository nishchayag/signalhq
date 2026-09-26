import { describe, expect, it } from "vitest";
import {
  buildAnswerSchema,
  createQuestionSchema,
  normalizeQuestionConfig,
  questionConfigIssues,
  updateQuestionSchema,
} from "@/schemas/questionSchema";
import type { QuestionLike } from "@/lib/answers";

const base = { questionText: "How was the offsite?" };
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("createQuestionSchema: typed questions", () => {
  it("still accepts a plain text question", () => {
    expect(createQuestionSchema.safeParse(base).success).toBe(true);
  });

  it.each(["rating", "nps"])("accepts %s with no config", (type) => {
    expect(createQuestionSchema.safeParse({ ...base, type }).success).toBe(true);
  });

  it("rejects an unknown type", () => {
    expect(createQuestionSchema.safeParse({ ...base, type: "slider" }).success).toBe(false);
  });

  it.each(["single", "multi"])("%s needs at least 2 options", (type) => {
    expect(
      createQuestionSchema.safeParse({ ...base, type, config: { options: [{ label: "A" }] } }).success
    ).toBe(false);
    expect(
      createQuestionSchema.safeParse({
        ...base,
        type,
        config: { options: [{ label: "A" }, { label: "B" }] },
      }).success
    ).toBe(true);
  });

  it("rejects more than 10 options", () => {
    const options = Array.from({ length: 11 }, (_, i) => ({ label: `Opt ${i}` }));
    expect(createQuestionSchema.safeParse({ ...base, type: "single", config: { options } }).success).toBe(false);
  });

  it("rejects duplicate labels (case-insensitive) and empty labels", () => {
    expect(
      createQuestionSchema.safeParse({
        ...base,
        type: "single",
        config: { options: [{ label: "Yes" }, { label: " yes " }] },
      }).success
    ).toBe(false);
    expect(
      createQuestionSchema.safeParse({
        ...base,
        type: "single",
        config: { options: [{ label: "Yes" }, { label: "   " }] },
      }).success
    ).toBe(false);
  });

  it("multi: maxSelections can't exceed the option count", () => {
    const options = [{ label: "A" }, { label: "B" }];
    expect(
      createQuestionSchema.safeParse({ ...base, type: "multi", config: { options, maxSelections: 3 } }).success
    ).toBe(false);
    expect(
      createQuestionSchema.safeParse({ ...base, type: "multi", config: { options, maxSelections: 2 } }).success
    ).toBe(true);
  });

  it("closesAt must be a future ISO datetime with an offset", () => {
    expect(createQuestionSchema.safeParse({ ...base, closesAt: future }).success).toBe(true);
    expect(createQuestionSchema.safeParse({ ...base, closesAt: past }).success).toBe(false);
    expect(createQuestionSchema.safeParse({ ...base, closesAt: "2030-01-01T10:00" }).success).toBe(false);
  });

  it("maxResponses must be a positive integer", () => {
    expect(createQuestionSchema.safeParse({ ...base, maxResponses: 3 }).success).toBe(true);
    expect(createQuestionSchema.safeParse({ ...base, maxResponses: 0 }).success).toBe(false);
    expect(createQuestionSchema.safeParse({ ...base, maxResponses: 2.5 }).success).toBe(false);
  });
});

describe("updateQuestionSchema: closing", () => {
  it("allows a past close date (close now) and null to clear", () => {
    expect(updateQuestionSchema.safeParse({ closesAt: past }).success).toBe(true);
    expect(updateQuestionSchema.safeParse({ closesAt: null, maxResponses: null }).success).toBe(true);
  });
});

describe("questionConfigIssues / normalizeQuestionConfig", () => {
  it("no issues for scale types; keys that don't apply are dropped", () => {
    expect(questionConfigIssues("rating", { options: [{ label: "x" }] })).toEqual([]);
    expect(
      normalizeQuestionConfig("rating", {
        options: [{ label: "x" }],
        maxSelections: 2,
        scaleLabels: { min: "Bad", max: "" },
      })
    ).toEqual({ allowComment: true, scaleLabels: { min: "Bad" } });
  });

  it("text has no config", () => {
    expect(normalizeQuestionConfig("text", { allowComment: false })).toBeUndefined();
  });

  it("flags duplicate option ids", () => {
    const issues = questionConfigIssues("single", {
      options: [
        { id: "a", label: "A" },
        { id: "a", label: "B" },
      ],
    });
    expect(issues.map((i) => i.message)).toContain("Duplicate option id");
  });
});

describe("buildAnswerSchema", () => {
  const text: QuestionLike = {};
  const rating: QuestionLike = { type: "rating" };
  const nps: QuestionLike = { type: "nps", config: { allowComment: false } };
  const options = [
    { id: "o1", label: "Red" },
    { id: "o2", label: "Green" },
    { id: "o3", label: "Blue" },
  ];
  const single: QuestionLike = { type: "single", config: { options } };
  const multi: QuestionLike = { type: "multi", config: { options, maxSelections: 2 } };

  it("text: content required, no answer", () => {
    expect(buildAnswerSchema(text).safeParse({ content: "" }).success).toBe(false);
    expect(buildAnswerSchema(text).parse({ content: " hi " })).toEqual({ content: "hi" });
  });

  it("rating: 1–5 integer, optional comment", () => {
    const s = buildAnswerSchema(rating);
    expect(s.parse({ score: 4 })).toEqual({ content: "", answer: { kind: "rating", score: 4 } });
    expect(s.parse({ score: 5, content: "  great " })).toEqual({
      content: "great",
      answer: { kind: "rating", score: 5 },
    });
    for (const score of [0, 6, 3.5, "4", null]) {
      expect(s.safeParse({ score }).success).toBe(false);
    }
    expect(s.safeParse({}).success).toBe(false);
  });

  it("nps: 0–10, and comments rejected when allowComment is false", () => {
    const s = buildAnswerSchema(nps);
    expect(s.parse({ score: 0 })).toEqual({ content: "", answer: { kind: "nps", score: 0 } });
    expect(s.safeParse({ score: 10 }).success).toBe(true);
    expect(s.safeParse({ score: 11 }).success).toBe(false);
    expect(s.safeParse({ score: 7, content: "because" }).success).toBe(false);
    // Whitespace-only trims to nothing — not a comment.
    expect(s.safeParse({ score: 7, content: "   " }).success).toBe(true);
  });

  it("single: exactly one known option, label snapshot", () => {
    const s = buildAnswerSchema(single);
    expect(s.parse({ choices: ["o2"] })).toEqual({
      content: "",
      answer: { kind: "single", choices: ["o2"], labels: ["Green"] },
    });
    expect(s.safeParse({ choices: ["o1", "o2"] }).success).toBe(false);
    expect(s.safeParse({ choices: [] }).success).toBe(false);
    expect(s.safeParse({ choices: ["nope"] }).success).toBe(false);
    expect(s.safeParse({ choices: "o1" }).success).toBe(false);
  });

  it("multi: up to maxSelections, unique, stored in option order", () => {
    const s = buildAnswerSchema(multi);
    expect(s.parse({ choices: ["o3", "o1"], content: "ok" })).toEqual({
      content: "ok",
      answer: { kind: "multi", choices: ["o1", "o3"], labels: ["Red", "Blue"] },
    });
    expect(s.safeParse({ choices: ["o1", "o2", "o3"] }).success).toBe(false);
    expect(s.safeParse({ choices: ["o1", "o1"] }).success).toBe(false);
  });

  it("rejects comments over 1000 characters", () => {
    expect(buildAnswerSchema(rating).safeParse({ score: 3, content: "a".repeat(1001) }).success).toBe(false);
  });
});
