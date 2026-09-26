import { describe, expect, it } from "vitest";
import { buildAnswerBody, canSubmitAnswer, closedMessage, toggleChoice } from "@/lib/answerForm";
import type { PublicQuestionConfig } from "@/lib/answers";

const textConfig: PublicQuestionConfig = { type: "text", allowComment: true };
const ratingConfig: PublicQuestionConfig = { type: "rating", allowComment: true, scale: { min: 1, max: 5 } };
const singleConfig: PublicQuestionConfig = {
  type: "single",
  allowComment: false,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
};
const multiConfig: PublicQuestionConfig = {
  type: "multi",
  allowComment: true,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ],
  maxSelections: 2,
};

describe("canSubmitAnswer", () => {
  it("text needs non-empty content", () => {
    expect(canSubmitAnswer(textConfig, { content: "" })).toBe(false);
    expect(canSubmitAnswer(textConfig, { content: "  " })).toBe(false);
    expect(canSubmitAnswer(textConfig, { content: "hi" })).toBe(true);
  });
  it("scale types need a score (0 counts)", () => {
    expect(canSubmitAnswer(ratingConfig, { content: "" })).toBe(false);
    expect(canSubmitAnswer(ratingConfig, { content: "", score: 0 })).toBe(true);
  });
  it("single needs exactly one choice", () => {
    expect(canSubmitAnswer(singleConfig, { content: "", choices: [] })).toBe(false);
    expect(canSubmitAnswer(singleConfig, { content: "", choices: ["a", "b"] })).toBe(false);
    expect(canSubmitAnswer(singleConfig, { content: "", choices: ["a"] })).toBe(true);
  });
  it("multi needs at least one choice", () => {
    expect(canSubmitAnswer(multiConfig, { content: "", choices: [] })).toBe(false);
    expect(canSubmitAnswer(multiConfig, { content: "", choices: ["a"] })).toBe(true);
  });
});

describe("buildAnswerBody", () => {
  it("text", () => {
    expect(buildAnswerBody(textConfig, { content: " hi " })).toEqual({ content: "hi" });
  });
  it("rating/nps carries score + trimmed comment", () => {
    expect(buildAnswerBody(ratingConfig, { content: " nice ", score: 4 })).toEqual({
      score: 4,
      content: "nice",
    });
  });
  it("single/multi carries choices + trimmed comment", () => {
    expect(buildAnswerBody(multiConfig, { content: "", choices: ["a", "b"] })).toEqual({
      choices: ["a", "b"],
      content: "",
    });
  });
});

describe("toggleChoice", () => {
  it("adds up to max, then no-ops", () => {
    let choices: string[] = [];
    choices = toggleChoice(choices, "a", 2);
    expect(choices).toEqual(["a"]);
    choices = toggleChoice(choices, "b", 2);
    expect(choices).toEqual(["a", "b"]);
    choices = toggleChoice(choices, "c", 2);
    expect(choices).toEqual(["a", "b"]);
  });
  it("removes an already-selected id regardless of the cap", () => {
    expect(toggleChoice(["a", "b"], "a", 1)).toEqual(["b"]);
  });
});

describe("closedMessage", () => {
  it("has a distinct message per reason, and a fallback", () => {
    expect(closedMessage("cap")).toMatch(/limit/);
    expect(closedMessage("date")).toMatch(/date/);
    expect(closedMessage(undefined)).toMatch(/no longer/);
  });
});
