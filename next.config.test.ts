import { describe, expect, it } from "vitest";
// This is the same compiled path-to-regexp Next.js itself uses to match a
// headers() `source` against a request path, so matching against it here
// reflects how Next will actually route these rules, without needing a dev
// server or build. It's an internal bundled module with no shipped types.
// @ts-expect-error no type declarations for this internal Next.js module
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import nextConfig from "./next.config";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function headersFor(path: string): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers!()) as HeaderRule[];
  const merged = new Map<string, string>();
  for (const rule of rules) {
    if (pathToRegexp(rule.source).test(path)) {
      for (const h of rule.headers) merged.set(h.key, h.value);
    }
  }
  return merged;
}

describe("next.config header rules", () => {
  it("gives an embed page no X-Frame-Options", async () => {
    const headers = await headersFor("/embed/q/x");
    expect(headers.has("X-Frame-Options")).toBe(false);
    // The rest of the baseline set still applies.
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps X-Frame-Options: DENY for a normal public page", async () => {
    const headers = await headersFor("/o/acme");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps X-Frame-Options: DENY for a path that merely looks like /embed", async () => {
    const headers = await headersFor("/embedx");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("gives /embed.js a public cache header", async () => {
    const headers = await headersFor("/embed.js");
    expect(headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});
