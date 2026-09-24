import type { MembershipRole } from "@/models/membership.model";
import { parseBeforeCursor, parseEscapedSearch } from "@/lib/pagination";

// The one place a message-list Mongo filter is built from query params, used
// by getMessages, questions/[id] GET, messages/export and semantic search,
// so the dashboard, the CSV and search can't drift apart.
//
// The route builds `base` (the authorization scope: org / question /
// general-vs-question / member-thread exclusion) and passes the request's
// searchParams; this adds the user-controlled narrowing on top. `base` keys
// are never overwritten by a param, so a param can only narrow the scope.
//
// Adding a filter param: parse it from `searchParams` inside
// buildMessageListFilter, push a clause onto `and` (or set a key that `base`
// can't contain), and decide which modes it applies to. Callers don't change.

/** Who is listing. `readSince` is the effective "before this counts as read"
 * cutoff (lib/readState.ts#effectiveReadSince) — for the `unread` filter. */
export interface MessageListViewer {
  userId: string;
  role: MembershipRole | null;
  readSince?: Date | null;
}

/**
 * - `page`: a dashboard list page — `q` regex search + `before` cursor.
 * - `export`: the CSV — `q` regex search, no cursor (it isn't paginated).
 * - `semantic`: `mode=semantic` — neither: `q` is the embedding query, and
 *   results are ranked by similarity, not paged by createdAt.
 */
export type MessageListMode = "page" | "export" | "semantic";

export interface BuildMessageListFilterOpts {
  base: Record<string, unknown>;
  searchParams: URLSearchParams;
  viewer: MessageListViewer;
  mode?: MessageListMode;
}

export function buildMessageListFilter({
  base,
  searchParams,
  viewer,
  mode = "page",
}: BuildMessageListFilterOpts): Record<string, unknown> {
  void viewer; // consumed by the per-viewer filters (unread, assignee=me)
  const filter: Record<string, unknown> = { ...base };
  const and: Record<string, unknown>[] = [];

  if (mode !== "semantic") {
    const search = parseEscapedSearch(searchParams);
    if (search) filter.content = { $regex: search, $options: "i" };
  }
  if (mode === "page") {
    const before = parseBeforeCursor(searchParams);
    if (before) filter.createdAt = { $lt: before };
  }

  if (and.length > 0) {
    filter.$and = [...((base.$and as Record<string, unknown>[] | undefined) ?? []), ...and];
  }
  return filter;
}
