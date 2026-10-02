import type { EmbedTheme } from "@/lib/securityHeaders";

export interface EmbedSnippetTarget {
  /** "org" renders a `data-org` attribute (app/embed/o/[orgSlug]); "question"
   * renders `data-question` (app/embed/q/[slug] — a global slug, no org). */
  kind: "org" | "question";
  slug: string;
}

/**
 * The exact `<script>` snippet shown on ShareDialog's Embed tab, loading
 * public/embed.js with the org or question slug and the chosen theme as
 * data attributes. Pure/DOM-free so it's unit-testable without rendering
 * the dialog. `scriptSrc` is the caller's `buildPublicUrl("/embed.js")` —
 * kept as a parameter (not computed here) so this stays server/client
 * agnostic, same reasoning as the rest of lib/publicUrl.ts's callers.
 */
export function buildEmbedSnippet(
  target: EmbedSnippetTarget,
  theme: EmbedTheme,
  scriptSrc: string
): string {
  const attr = target.kind === "question" ? "data-question" : "data-org";
  return `<script src="${scriptSrc}" ${attr}="${target.slug}" data-theme="${theme}" async></script>`;
}
