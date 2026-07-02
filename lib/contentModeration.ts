import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

// Singleton matcher — building it is the expensive part, so do it once per
// process (mirrors the connectDB singleton pattern used elsewhere).
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const REJECTION_MESSAGE =
  "Your message couldn't be sent because it appears to contain hateful, threatening, or abusive language. Please revise it and try again.";

/**
 * v1 content moderation for public anonymous-submission endpoints: a static,
 * library-backed blocklist (no per-org customization, no review queue —
 * see CLAUDE.md). Blocks obvious abuse before it's ever stored.
 */
export function moderateContent(content: string): {
  allowed: boolean;
  reason?: string;
} {
  if (matcher.hasMatch(content)) {
    return { allowed: false, reason: REJECTION_MESSAGE };
  }
  return { allowed: true };
}
