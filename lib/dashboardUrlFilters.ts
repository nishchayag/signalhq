/**
 * Deep-link filters (`/dashboard?tag=…`/`?sentiment=…`, set by the analytics
 * page's click-to-filter) are parsed out of the URL exactly once and then
 * re-applied every time the org-key effect in useDashboardData runs for that
 * *same* org — not just the first time. That makes the effect idempotent
 * under React Strict Mode's dev double-invoke (which re-runs it with the
 * same refs before anything else in the app can change orgKey): without
 * this, the second run's `resetForNewOrg()` wipes the filter that the first
 * run just applied, and the plain unfiltered fetch that follows lands last.
 * Switching to a genuinely different org must still ignore the stale URL.
 */
export interface ParsedUrlFilters {
  /** The org these filters were parsed for. */
  orgKey: string;
  tag?: string;
  sentiment?: string;
}

export interface UrlFilterResolution {
  /** Next value to store in the caller's ref. */
  parsed: ParsedUrlFilters | null;
  /** Filters to apply this run, or null if none apply (caller should fall
   * back to its normal unfiltered fetch). */
  apply: { tag?: string; sentiment?: string } | null;
}

/**
 * Pure decision function: given what was previously parsed (or null, before
 * the first run) and the current org/search string, returns what to store
 * back and what filters (if any) to apply this run.
 *
 * @param parsed   The previously parsed filters, or null if never parsed yet.
 * @param hasParsed Whether parsing has already happened at least once (kept
 *                  separate from `parsed` because "parsed, found nothing" and
 *                  "never parsed" must be distinguished).
 */
export function resolveUrlFilters(
  parsed: ParsedUrlFilters | null,
  hasParsed: boolean,
  orgKey: string,
  search: string
): UrlFilterResolution {
  let next = parsed;
  if (!hasParsed) {
    const params = new URLSearchParams(search);
    const tag = params.get("tag") ?? undefined;
    const sentiment = params.get("sentiment") ?? undefined;
    next = tag || sentiment ? { orgKey, tag, sentiment } : null;
  }
  const apply = next && next.orgKey === orgKey ? { tag: next.tag, sentiment: next.sentiment } : null;
  return { parsed: next, apply };
}
