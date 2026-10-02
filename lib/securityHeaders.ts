// Pure, DB-free security-header helpers shared by proxy.ts (which can't be
// unit-tested directly — it needs a live NextRequest/getToken/Mongo chain)
// and its tests. Keep this module free of any request-object dependency so
// every export here stays a plain function of strings in, strings out.

export type EmbedTheme = "light" | "dark" | "system";

export interface EmbedContext {
  embed: boolean;
  theme: EmbedTheme;
}

const VALID_EMBED_THEMES: readonly EmbedTheme[] = ["light", "dark", "system"];

function isValidEmbedTheme(value: string | null): value is EmbedTheme {
  return value !== null && (VALID_EMBED_THEMES as readonly string[]).includes(value);
}

// Derives embed mode and theme purely from the request path + query string.
// Never reads request headers, so a client-spoofed `x-embed` header can't
// influence this — only the URL can turn embed mode on.
export function embedContext(
  pathname: string,
  searchParams?: URLSearchParams | string | null
): EmbedContext {
  const embed = pathname.startsWith("/embed/");
  if (!embed) return { embed: false, theme: "system" };

  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : (searchParams ?? new URLSearchParams());
  const raw = params.get("theme");
  const theme = isValidEmbedTheme(raw) ? raw : "system";
  return { embed: true, theme };
}

// Deletes any client-sent embed headers before the proxy sets its own trusted
// values (or leaves them unset on non-embed paths). Called unconditionally,
// on every request, so a spoofed header never survives into the request that
// reaches Server Components.
export function sanitizeEmbedHeaders(headers: Headers): void {
  headers.delete("x-embed");
  headers.delete("x-embed-theme");
}

// Per-request nonce + strict CSP, following Next.js's documented nonce
// recipe: the nonce is forwarded to Server Components via the `x-nonce`
// request header (read with `headers()` in app/layout.tsx and passed to the
// GA/Clarity/next-themes scripts we author), and Next automatically applies
// it to the script tags it renders for its own bundling/hydration. Combined
// with 'strict-dynamic', any script a nonce'd script loads (e.g. Clarity's
// snippet inserting its own tag/analytics beacon) is trusted transitively —
// no origin allowlist needed for those. `https:` and 'unsafe-inline' are
// inert fallbacks for browsers that don't understand nonce/strict-dynamic;
// browsers that do ignore them.
export function buildCsp(nonce: string, opts: { embed: boolean } = { embed: false }): string {
  const connectSrc = ["'self'"];
  if (process.env.NEXT_PUBLIC_GA_ID) {
    connectSrc.push(
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://*.google-analytics.com"
    );
  }
  if (process.env.NEXT_PUBLIC_CLARITY_ID) {
    connectSrc.push("https://www.clarity.ms", "https://*.clarity.ms");
  }

  // React dev mode uses eval() for its debugging features (never in
  // production builds, per React's own warning) — allow it only outside prod
  // so local dev consoles stay clean without loosening the deployed policy.
  const scriptSrc = [`'nonce-${nonce}'`, `'strict-dynamic'`, `https:`, `'unsafe-inline'`];
  if (process.env.NODE_ENV !== "production") scriptSrc.push(`'unsafe-eval'`);

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(" ")}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Embedded pages are meant to be framed by any site (free, with a
    // "powered by" badge) — everywhere else stays locked down.
    `frame-ancestors ${opts.embed ? "*" : "'none'"}`,
  ];
  // Safari enforces this literally even for localhost, rewriting http:// asset
  // requests to https:// and failing them since dev has no TLS listener —
  // breaking CSS/JS with no console error on Safari specifically (Chrome/
  // Firefox treat localhost as already-trustworthy and skip the upgrade).
  if (process.env.NODE_ENV === "production") {
    directives.push(`upgrade-insecure-requests`);
  }
  return directives.join("; ");
}
