import type { NextConfig } from "next";

// Baseline security headers. Content-Security-Policy is set separately in
// proxy.ts, not here — it needs a fresh nonce per request (for the GA/
// Clarity/next-themes inline scripts), which only the proxy can generate.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing outside /embed/* is meant to be iframed (feedback pages are
  // shared as plain links) — embed pages opt out of this below, since the
  // whole point of /embed/* is to be framed on another site. proxy.ts's CSP
  // `frame-ancestors` directive is the one that actually controls framing;
  // this is the legacy header for browsers that only understand it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// 2 years; production-only. Safari (unlike Chrome/Firefox) doesn't reliably
// treat plain-HTTP delivery as a no-op — it can still pin the policy for the
// host, after which it silently rewrites *every* subsequent request
// (including CSS/JS subresources) from http:// to https://, which then fail
// outright against a dev server with no TLS listener. Sending it only in
// production avoids ever pinning it against localhost.
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

// Same set, minus X-Frame-Options, for /embed/* pages — computed after the
// HSTS push above so it still carries HSTS in production.
const embedSecurityHeaders = securityHeaders.filter((h) => h.key !== "X-Frame-Options");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "tse3.mm.bing.net" },
    ],
  },
  async headers() {
    return [
      // The full header set applies everywhere except /embed/*.
      { source: "/((?!embed/).*)", headers: securityHeaders },
      // /embed/* pages are meant to be framed by the embedding site, so they
      // get everything except X-Frame-Options (CSP's `frame-ancestors`,
      // built per-request in proxy.ts, is what actually controls framing).
      { source: "/embed/:path*", headers: embedSecurityHeaders },
      // The public loader script: long-lived caching, no app security
      // headers needed on a static JS file.
      { source: "/embed.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
};

export default nextConfig;
