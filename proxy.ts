import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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
    path === "/terms" ||
    path === "/privacy";
  return authPages.includes(path) || isPublicFeedback;
};

export async function proxy(request: NextRequest) {
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
  // Force login for protected pages.
  if (!token && !isPublicPage(currUrl)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Keep authenticated users out of the auth-only pages (but NOT public
  // feedback/invite pages, which they're allowed to view).
  if (token && authPages.includes(currUrl)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|api/).*)",
  ],
};
