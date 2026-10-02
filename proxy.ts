import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { currentSessionUser } from "@/lib/sessionRevocation";
import { buildCsp, embedContext, sanitizeEmbedHeaders } from "@/lib/securityHeaders";

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
// (notably /invite/* and /embed/* — an invitee is logged in when accepting,
// and an embed can be viewed by a logged-in visitor on the embedding site).
const isPublicPage = (path: string) => {
  const isPublicFeedback =
    path.startsWith("/u/") ||
    path.startsWith("/o/") ||
    path.startsWith("/q/") ||
    path.startsWith("/r/") ||
    path.startsWith("/invite/") ||
    path.startsWith("/embed/") ||
    path === "/pricing" ||
    // startsWith: also covers the guide's screenshot assets (/guide/*.png)
    path.startsWith("/guide") ||
    path === "/terms" ||
    path === "/privacy";
  return authPages.includes(path) || isPublicFeedback;
};

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const currUrl = request.nextUrl.pathname;

  // Forwarded downstream so Server Components can read it via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Always strip any client-sent embed headers first, so a spoofed
  // `x-embed`/`x-embed-theme` from the request never survives — only the
  // trusted values the proxy derives from the URL below are forwarded.
  sanitizeEmbedHeaders(requestHeaders);
  const { embed, theme } = embedContext(currUrl, request.nextUrl.searchParams);
  if (embed) {
    requestHeaders.set("x-embed", "1");
    requestHeaders.set("x-embed-theme", theme);
  }

  const csp = buildCsp(nonce, { embed });

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
    // embed.js is the public loader script served from public/ — it must
    // never get redirected to /login for a logged-out visitor embedding it
    // on their own site.
    "/((?!_next|favicon.ico|icon.svg|apple-icon.png|icon-192.png|icon-512.png|sitemap.xml|robots.txt|manifest.webmanifest|api/|embed\\.js).*)",
  ],
};
