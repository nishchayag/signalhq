import { describe, expect, it } from "vitest";
import {
  RESIZE_MESSAGE_TYPE,
  buildResizeMessage,
  nextReportedHeight,
  roundUpToStep,
} from "@/lib/embedResize";

describe("roundUpToStep", () => {
  it("rounds up to the next 40px step", () => {
    expect(roundUpToStep(0)).toBe(0);
    expect(roundUpToStep(1)).toBe(40);
    expect(roundUpToStep(40)).toBe(40);
    expect(roundUpToStep(41)).toBe(80);
    expect(roundUpToStep(399)).toBe(400);
    expect(roundUpToStep(400)).toBe(400);
  });

  it("clamps negative input to 0", () => {
    expect(roundUpToStep(-50)).toBe(0);
  });

  it("supports a custom step", () => {
    expect(roundUpToStep(10, 25)).toBe(25);
    expect(roundUpToStep(25, 25)).toBe(25);
  });
});

describe("nextReportedHeight", () => {
  it("grows to the rounded measured height from a smaller previous height", () => {
    expect(nextReportedHeight(0, 100)).toBe(120);
  });

  it("never shrinks below the previous reported height", () => {
    expect(nextReportedHeight(480, 100)).toBe(480);
  });

  it("holds steady when the measured height rounds to the same step", () => {
    expect(nextReportedHeight(440, 405)).toBe(440);
  });

  it("grows again once content genuinely exceeds the previous height", () => {
    expect(nextReportedHeight(440, 441)).toBe(480);
  });
});

describe("buildResizeMessage", () => {
  it("carries only a type tag and a height — nothing else", () => {
    const msg = buildResizeMessage(360);
    expect(msg).toEqual({ type: "signalhq:resize", height: 360 });
    expect(Object.keys(msg).sort()).toEqual(["height", "type"]);
    expect(msg.type).toBe(RESIZE_MESSAGE_TYPE);
  });
});
