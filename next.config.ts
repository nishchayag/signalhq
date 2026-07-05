import type { NextConfig } from "next";

// Baseline security headers. A real Content-Security-Policy is deliberately
// not set yet — it needs a proper audit of the GA/Clarity script origins first.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing in the app is meant to be iframed (feedback pages are shared as
  // plain links) — revisit if embeddable widgets ever become a feature.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 2 years; ignored by browsers over plain HTTP, so safe for local dev.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

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
