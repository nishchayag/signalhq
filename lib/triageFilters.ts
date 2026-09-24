// Client-side (and test-only) counterpart of lib/messageListQuery.ts's
// query-param parsing: turns the dashboard's per-list filter state into the
// exact query params the list routes (getMessages, questions/[id],
// messages/export) understand. Pure and mongoose-free so it's usable from
// "use client" hooks and from plain Vitest units.

import type { MessageStatus } from "@/lib/messageListQuery";

export type AssigneeFilter = "" | "me" | "none" | string;

export interface TriageFilters {
  status: MessageStatus;
  unread: boolean;
  label: string; // "" = any label
  assignee: AssigneeFilter; // "" = any assignee
}

export const DEFAULT_TRIAGE_FILTERS: TriageFilters = {
  status: "open",
  unread: false,
  label: "",
  assignee: "",
};

/** True if `filters` differs from the all-open, unfiltered default. */
export function isFilterActive(filters: TriageFilters): boolean {
  return (
    filters.status !== DEFAULT_TRIAGE_FILTERS.status ||
    filters.unread !== DEFAULT_TRIAGE_FILTERS.unread ||
    filters.label !== "" ||
    filters.assignee !== ""
  );
}

/**
 * Serialize triage filters into query params, omitting anything at its
 * default so a plain "open" list keeps looking like `?` with nothing extra
 * (matches the server's own defaults in lib/messageListQuery.ts).
 */
export function triageFiltersToParams(
  filters: TriageFilters
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (filters.status !== "open") params.status = filters.status;
  if (filters.unread) params.unread = "1";
  if (filters.label) params.label = filters.label;
  if (filters.assignee) params.assignee = filters.assignee;
  return params;
}
