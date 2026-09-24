// Prompt-injection defenses shared by every AI feature that folds untrusted,
// user-authored text (feedback content, hints, names) into a model prompt.

/**
 * Wrap each item as `<tag n="i">…</tag>`, neutralising `<`/`>` inside the
 * content so it can't forge a closing tag or start a new one. The system
 * prompt accompanying the fenced block must tell the model this content is
 * data to read, never instructions to follow.
 */
export function fenceUntrusted(items: string[], tag = "feedback"): string {
  return items
    .map((item, i) => {
      const neutralised = item.replace(/</g, "‹").replace(/>/g, "›");
      return `<${tag} n="${i}">${neutralised}</${tag}>`;
    })
    .join("\n");
}
