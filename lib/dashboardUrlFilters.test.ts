import { describe, expect, it } from "vitest";
import { resolveUrlFilters } from "@/lib/dashboardUrlFilters";

describe("resolveUrlFilters", () => {
  it("parses tag/sentiment out of the search string on the first (unparsed) run", () => {
    const result = resolveUrlFilters(null, false, "org1", "?tag=bug&sentiment=negative");
    expect(result.parsed).toEqual({ orgKey: "org1", tag: "bug", sentiment: "negative" });
    expect(result.apply).toEqual({ tag: "bug", sentiment: "negative" });
  });

  it("stores null (parsed, but nothing found) when the URL has no filters", () => {
    const result = resolveUrlFilters(null, false, "org1", "");
    expect(result.parsed).toBeNull();
    expect(result.apply).toBeNull();
  });

  it("re-applies the same filters on a re-run for the same org (Strict Mode double-invoke)", () => {
    const first = resolveUrlFilters(null, false, "org1", "?tag=bug");
    // Second invocation: hasParsed=true, same orgKey, same stored `parsed`.
    const second = resolveUrlFilters(first.parsed, true, "org1", "?tag=bug");
    expect(second.apply).toEqual({ tag: "bug", sentiment: undefined });
  });

  it("does not re-read the URL once already parsed, even if the search string changes", () => {
    const first = resolveUrlFilters(null, false, "org1", "?tag=bug");
    const second = resolveUrlFilters(first.parsed, true, "org1", "?tag=other-tag");
    expect(second.apply).toEqual({ tag: "bug", sentiment: undefined });
  });

  it("ignores the stale URL filters once the org changes", () => {
    const first = resolveUrlFilters(null, false, "org1", "?tag=bug");
    const second = resolveUrlFilters(first.parsed, true, "org2", "?tag=bug");
    expect(second.apply).toBeNull();
    // The stored parsed value itself is untouched (still belongs to org1).
    expect(second.parsed).toEqual({ orgKey: "org1", tag: "bug", sentiment: undefined });
  });

  it("keeps returning null once parsed as null, even for later re-runs of the same org", () => {
    const first = resolveUrlFilters(null, false, "org1", "");
    const second = resolveUrlFilters(first.parsed, true, "org1", "?tag=bug");
    expect(second.apply).toBeNull();
  });
});
