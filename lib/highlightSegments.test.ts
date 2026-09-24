import { describe, expect, it } from "vitest";
import { highlightSegments } from "@/lib/highlightSegments";

describe("highlightSegments", () => {
  it("returns the whole text unhighlighted for no snippets", () => {
    expect(highlightSegments("hello world", [])).toEqual([
      { text: "hello world", highlighted: false },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(highlightSegments("", ["hi"])).toEqual([]);
  });

  it("highlights a single snippet", () => {
    expect(highlightSegments("As the only nurse on Ward 4", ["Ward 4"])).toEqual([
      { text: "As the only nurse on ", highlighted: false },
      { text: "Ward 4", highlighted: true },
    ]);
  });

  it("highlights every occurrence of a repeated snippet", () => {
    const segments = highlightSegments("cat sat on the cat mat", ["cat"]);
    expect(segments).toEqual([
      { text: "cat", highlighted: true },
      { text: " sat on the ", highlighted: false },
      { text: "cat", highlighted: true },
      { text: " mat", highlighted: false },
    ]);
  });

  it("highlights multiple distinct snippets in order", () => {
    const segments = highlightSegments("Dr. Patel said Ward 4 is busy", ["Dr. Patel", "Ward 4"]);
    expect(segments).toEqual([
      { text: "Dr. Patel", highlighted: true },
      { text: " said ", highlighted: false },
      { text: "Ward 4", highlighted: true },
      { text: " is busy", highlighted: false },
    ]);
  });

  it("does not produce overlapping segments when snippets overlap", () => {
    // "night-shift nurse" and "shift nurse on Ward" overlap; the earliest
    // start wins and the later, overlapping match is dropped.
    const segments = highlightSegments("the night-shift nurse on Ward 4", [
      "night-shift nurse",
      "shift nurse on Ward",
    ]);
    const highlighted = segments.filter((s) => s.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].text).toBe("night-shift nurse");
    // Segments concatenate back to the original text with none dropped.
    expect(segments.map((s) => s.text).join("")).toBe("the night-shift nurse on Ward 4");
  });

  it("prefers the longer match when two snippets start at the same index", () => {
    const segments = highlightSegments("Ward 4 nurse", ["Ward", "Ward 4"]);
    const highlighted = segments.filter((s) => s.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].text).toBe("Ward 4");
  });

  it("dedupes an identical snippet passed twice", () => {
    const segments = highlightSegments("only one match here", ["one", "one"]);
    expect(segments.filter((s) => s.highlighted)).toHaveLength(1);
  });

  it("ignores empty-string snippets", () => {
    const segments = highlightSegments("hello", ["", "ell"]);
    expect(segments).toEqual([
      { text: "h", highlighted: false },
      { text: "ell", highlighted: true },
      { text: "o", highlighted: false },
    ]);
  });

  it("ignores a snippet not present in the text", () => {
    const segments = highlightSegments("hello world", ["missing"]);
    expect(segments).toEqual([{ text: "hello world", highlighted: false }]);
  });

  it("is case-sensitive", () => {
    const segments = highlightSegments("Ward 4", ["ward 4"]);
    expect(segments).toEqual([{ text: "Ward 4", highlighted: false }]);
  });
});
