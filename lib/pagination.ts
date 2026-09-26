import { NextRequest } from "next/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Cursor pagination params from `?limit=&before=` — `before` is an ISO
 * createdAt cursor (strictly-less-than), `limit` is clamped to [1, 100]. */
export function parsePagination(request: NextRequest): {
  limit: number;
  before: Date | null;
} {
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return { limit, before: parseBeforeCursor(searchParams) };
}

/** `?before=` ISO createdAt cursor (strictly-less-than), or null. */
export function parseBeforeCursor(searchParams: URLSearchParams): Date | null {
  const raw = searchParams.get("before");
  return raw && !isNaN(Date.parse(raw)) ? new Date(raw) : null;
}

/** `?q=` as a case-insensitive substring pattern with regex metacharacters
 * escaped (no pattern injection, no ReDoS), or null if absent/blank. */
export function parseEscapedSearch(searchParams: URLSearchParams): string | null {
  const q = searchParams.get("q")?.trim();
  if (!q) return null;
  return q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive substring search term from `?q=`, or null if absent.
 * Regex special characters are escaped so user input can't inject a pattern
 * (and can't blow up as a ReDoS vector). */
export function parseSearchQuery(request: NextRequest): string | null {
  return parseEscapedSearch(new URL(request.url).searchParams);
}

/** Split a `limit + 1`-sized fetch into a page + hasMore/nextCursor, without
 * a separate count query. Assumes `items` is sorted by `createdAt` desc. */
export function paginate<T extends { createdAt: Date | string }>(
  items: T[],
  limit: number
): { page: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];
  return {
    page,
    hasMore,
    nextCursor: hasMore && last ? new Date(last.createdAt).toISOString() : null,
  };
}
