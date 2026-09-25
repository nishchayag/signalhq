import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIAGE_FILTERS,
  isFilterActive,
  triageFiltersToParams,
  type TriageFilters,
} from "@/lib/triageFilters";

describe("triageFiltersToParams", () => {
  it("omits every key at its default", () => {
    expect(triageFiltersToParams(DEFAULT_TRIAGE_FILTERS)).toEqual({});
  });

  it("includes status only when not open", () => {
    const filters: TriageFilters = { ...DEFAULT_TRIAGE_FILTERS, status: "archived" };
    expect(triageFiltersToParams(filters)).toEqual({ status: "archived" });
  });

  it("includes status=all", () => {
    const filters: TriageFilters = { ...DEFAULT_TRIAGE_FILTERS, status: "all" };
    expect(triageFiltersToParams(filters)).toEqual({ status: "all" });
  });

  it("serializes unread as '1'", () => {
    const filters: TriageFilters = { ...DEFAULT_TRIAGE_FILTERS, unread: true };
    expect(triageFiltersToParams(filters)).toEqual({ unread: "1" });
  });

  it("passes label and assignee through unchanged", () => {
    const filters: TriageFilters = {
      ...DEFAULT_TRIAGE_FILTERS,
      label: "64abc0000000000000000001",
      assignee: "me",
    };
    expect(triageFiltersToParams(filters)).toEqual({
      label: "64abc0000000000000000001",
      assignee: "me",
    });
  });

  it("combines every non-default filter", () => {
    const filters: TriageFilters = {
      status: "all",
      unread: true,
      label: "l1",
      assignee: "none",
      score: "",
      choice: "",
    };
    expect(triageFiltersToParams(filters)).toEqual({
      status: "all",
      unread: "1",
      label: "l1",
      assignee: "none",
    });
  });

  it("passes score and choice through unchanged", () => {
    expect(triageFiltersToParams({ ...DEFAULT_TRIAGE_FILTERS, score: "9-10" })).toEqual({
      score: "9-10",
    });
    expect(triageFiltersToParams({ ...DEFAULT_TRIAGE_FILTERS, choice: "opt1" })).toEqual({
      choice: "opt1",
    });
  });
});

describe("isFilterActive", () => {
  it("is false for the default", () => {
    expect(isFilterActive(DEFAULT_TRIAGE_FILTERS)).toBe(false);
  });

  it("is true when any field differs from default", () => {
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, status: "archived" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, unread: true })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, label: "x" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, assignee: "me" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, score: "4" })).toBe(true);
    expect(isFilterActive({ ...DEFAULT_TRIAGE_FILTERS, choice: "opt1" })).toBe(true);
  });
});
