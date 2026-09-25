import { describe, expect, it } from "vitest";
import {
  assignOptionIds,
  formatAnswer,
  publicQuestionConfig,
  questionState,
  questionType,
  sameOptionIds,
} from "@/lib/answers";

describe("questionType", () => {
  it("missing or unknown ⇒ text", () => {
    expect(questionType({})).toBe("text");
    expect(questionType({ type: null })).toBe("text");
    expect(questionType({ type: "nps" })).toBe("nps");
  });
});

describe("formatAnswer", () => {
  it("formats each kind", () => {
    expect(formatAnswer(undefined)).toBe("");
    expect(formatAnswer({ kind: "rating", score: 4 })).toBe("4/5");
    expect(formatAnswer({ kind: "nps", score: 0 })).toBe("0/10");
    expect(formatAnswer({ kind: "single", choices: ["a"], labels: ["Blue"] })).toBe("Blue");
    expect(formatAnswer({ kind: "multi", choices: ["a", "b"], labels: ["Blue", "Green"] })).toBe(
      "Blue, Green"
    );
  });
});

describe("questionState", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  it("open by default", () => {
    expect(questionState({}, now)).toEqual({ closed: false });
  });
  it("closes at the close date (inclusive)", () => {
    expect(questionState({ closesAt: "2026-09-25T12:00:00Z" }, now)).toEqual({ closed: true, reason: "date" });
    expect(questionState({ closesAt: new Date("2026-09-25T12:00:01Z") }, now)).toEqual({ closed: false });
  });
  it("closes when the cap is reached", () => {
    expect(questionState({ maxResponses: 3, responseCount: 2 }, now)).toEqual({ closed: false });
    expect(questionState({ maxResponses: 3, responseCount: 3 }, now)).toEqual({ closed: true, reason: "cap" });
    expect(questionState({ maxResponses: null, responseCount: 99 }, now)).toEqual({ closed: false });
  });
});

describe("publicQuestionConfig", () => {
  it("text", () => {
    expect(publicQuestionConfig({})).toEqual({ type: "text", allowComment: true });
  });
  it("scale types carry the fixed scale and labels, never counts", () => {
    const out = publicQuestionConfig({
      type: "nps",
      config: { allowComment: false, scaleLabels: { min: "Never", max: "Always" } },
      maxResponses: 10,
      responseCount: 4,
    });
    expect(out).toEqual({
      type: "nps",
      allowComment: false,
      scale: { min: 0, max: 10 },
      scaleLabels: { min: "Never", max: "Always" },
    });
  });
  it("multi carries options and effective maxSelections", () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    expect(publicQuestionConfig({ type: "multi", config: { options } })).toEqual({
      type: "multi",
      allowComment: true,
      options,
      maxSelections: 2,
    });
  });
});

describe("assignOptionIds / sameOptionIds", () => {
  it("keeps known ids, replaces unknown and duplicate ones", () => {
    const out = assignOptionIds(
      [{ id: "keep", label: "A" }, { id: "made-up", label: "B" }, { label: "C" }, { id: "keep", label: "D" }],
      ["keep"]
    );
    expect(out[0]).toEqual({ id: "keep", label: "A" });
    expect(out[1].id).not.toBe("made-up");
    expect(new Set(out.map((o) => o.id)).size).toBe(4);
  });
  it("compares id sets order-insensitively", () => {
    expect(sameOptionIds([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }])).toBe(true);
    expect(sameOptionIds([{ id: "a" }], [{ id: "a" }, { id: "b" }])).toBe(false);
  });
});
