import { describe, expect, it } from "vitest";
import { brandingView } from "@/lib/branding";

describe("brandingView", () => {
  it("defaults every field when branding is entirely absent", () => {
    expect(brandingView({})).toEqual({ accent: "yellow", welcomeText: "", logoVersion: 0 });
  });

  it("falls back to the default accent for a stored value outside the curated palette", () => {
    // Defensive: this shouldn't happen through the API (zod enforces the
    // enum), but a raw DB write or a future palette change shouldn't crash
    // or render garbage.
    expect(brandingView({ branding: { accent: "not-a-real-color" } }).accent).toBe("yellow");
  });

  it("passes through valid stored values", () => {
    expect(brandingView({ branding: { accent: "blue", welcomeText: "Hi", logoVersion: 4 } })).toEqual({
      accent: "blue",
      welcomeText: "Hi",
      logoVersion: 4,
    });
  });
});
