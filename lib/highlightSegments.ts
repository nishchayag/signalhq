export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Split `text` into segments, marking every verbatim occurrence of any
 * `snippets` entry as highlighted (case-sensitive substring match via
 * `indexOf` — mirrors how POST /api/guard's `issues[].snippet` relates to
 * the submitted content). Used to render <mark> around guard issues without
 * `dangerouslySetInnerHTML`.
 *
 * - A snippet can occur (and gets highlighted) more than once.
 * - Overlapping matches — from the same or different snippets — never
 *   produce overlapping segments: matches are resolved left-to-right,
 *   preferring the earliest start and, on a tie, the longest match: the
 *   first accepted range "claims" its span and later overlapping ranges are
 *   dropped.
 * - Empty/duplicate snippets, and snippets not found in `text`, are ignored.
 */
export function highlightSegments(text: string, snippets: string[]): HighlightSegment[] {
  if (!text) return [];

  const ranges: { start: number; end: number }[] = [];
  const uniqueSnippets = Array.from(new Set(snippets.filter((s) => s.length > 0)));

  for (const snippet of uniqueSnippets) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(snippet, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + snippet.length });
      from = idx + 1; // step by one so overlapping self-occurrences are still found
    }
  }

  if (ranges.length === 0) return [{ text, highlighted: false }];

  // Earliest start first; on a tie, the longest match wins so it "covers"
  // shorter matches starting at the same point.
  ranges.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const accepted: { start: number; end: number }[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start >= lastEnd) {
      accepted.push(range);
      lastEnd = range.end;
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of accepted) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), highlighted: false });
    }
    segments.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }

  return segments;
}
