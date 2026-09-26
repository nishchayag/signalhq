import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { currentSessionUser } from "@/lib/sessionRevocation";

// Auth-only pages: a logged-in user has no business here and is bounced to the
// dashboard. A logged-out user is allowed (this is where they sign in).
const authPages = [
  "/",
  "/login",
  "/signup",
  "/forgotPassword",
  "/resetPassword",
  "/verifyEmail",
];

// Pages accessible without a session. Logged-in users may also view these
// (notably /invite/* — the invitee is logged in when accepting).
const isPublicPage = (path: string) => {
  const isPublicFeedback =
    path.startsWith("/u/") ||
    path.startsWith("/o/") ||
    path.startsWith("/q/") ||
    path.startsWith("/r/") ||
    path.startsWith("/invite/") ||
    path === "/pricing" ||
    // startsWith: also covers the guide's screenshot assets (/guide/*.png)
    path.startsWith("/guide") ||
    path === "/terms" ||
    path === "/privacy";
  return authPages.includes(path) || isPublicFeedback;
};

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
function buildCsp(nonce: string): string {
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
    `frame-ancestors 'none'`,
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

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forwarded downstream so Server Components can read it via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Explicit, not inferred: getToken()'s default heuristic derives this from
  // NEXTAUTH_URL starting with "https://" (falling back to `!!process.env
  // .VERCEL` only when NEXTAUTH_URL is entirely unset) — a bare-domain
  // NEXTAUTH_URL (no scheme) silently resolves to `false` and makes getToken
  // look for the wrong cookie name, breaking auth in production. Base it on
  // the actual request instead.
  const secureCookie =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie,
  });
  const currUrl = request.nextUrl.pathname;

  // getToken() only decodes the cookie — it never runs the jwt callback, so
  // it can't see a revoked session (password changed/reset elsewhere). Check
  // tokenVersion here too, otherwise the first navigation after revocation
  // still renders protected pages from a dead cookie. A revoked cookie is
  // cleared below so the browser stops sending it.
  let revoked = false;
  if (token?._id) {
    revoked = !(await currentSessionUser(token._id, token.tokenVersion));
  }
  // Both checks key on the same flag: gating one on `token` and the other on
  // `token._id` would bounce a revoked/empty token login <-> dashboard.
  const authed = Boolean(token?._id) && !revoked;

  let response: NextResponse;
  if (!authed && !isPublicPage(currUrl)) {
    // Force login for protected pages.
    response = NextResponse.redirect(new URL("/login", request.url));
  } else if (authed && authPages.includes(currUrl)) {
    // Keep authenticated users out of the auth-only pages (but NOT public
    // feedback/invite pages, which they're allowed to view).
    response = NextResponse.redirect(new URL("/dashboard", request.url));
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
  }

  if (revoked) {
    // Session cookie may be chunked (name.0, name.1, …).
    const base = `${secureCookie ? "__Secure-" : ""}next-auth.session-token`;
    for (const { name } of request.cookies.getAll()) {
      if (name === base || name.startsWith(`${base}.`)) {
        response.cookies.set(name, "", {
          maxAge: 0,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: secureCookie,
        });
      }
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|icon.svg|apple-icon.png|icon-192.png|icon-512.png|sitemap.xml|robots.txt|manifest.webmanifest|api/).*)",
  ],
};
