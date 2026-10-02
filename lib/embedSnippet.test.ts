import { describe, expect, it } from "vitest";
import { buildEmbedSnippet } from "@/lib/embedSnippet";

const SCRIPT_SRC = "https://signal.example.com/embed.js";

describe("buildEmbedSnippet", () => {
  it("renders data-org for an org target", () => {
    const snippet = buildEmbedSnippet({ kind: "org", slug: "acme" }, "system", SCRIPT_SRC);
    expect(snippet).toBe(
      `<script src="${SCRIPT_SRC}" data-org="acme" data-theme="system" async></script>`
    );
  });

  it("renders data-question for a question target", () => {
    const snippet = buildEmbedSnippet({ kind: "question", slug: "q1abcdef" }, "dark", SCRIPT_SRC);
    expect(snippet).toBe(
      `<script src="${SCRIPT_SRC}" data-question="q1abcdef" data-theme="dark" async></script>`
    );
  });

  it("carries the exact theme passed, including light", () => {
    const snippet = buildEmbedSnippet({ kind: "org", slug: "acme" }, "light", SCRIPT_SRC);
    expect(snippet).toContain('data-theme="light"');
  });
});
