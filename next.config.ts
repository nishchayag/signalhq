import type { NextConfig } from "next";

// Baseline security headers. Content-Security-Policy is set separately in
// proxy.ts, not here — it needs a fresh nonce per request (for the GA/
// Clarity/next-themes inline scripts), which only the proxy can generate.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing in the app is meant to be iframed (feedback pages are shared as
  // plain links) — revisit if embeddable widgets ever become a feature.
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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "tse3.mm.bing.net" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
