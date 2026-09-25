/**
 * Builds absolute public URLs (for copy-link buttons, QR codes, share
 * sheets, etc).
 *
 * Prefers `NEXT_PUBLIC_BASE_URL` (trimmed of any trailing slash) so a link
 * or QR code generated on localhost or a preview deploy still encodes the
 * production host. Falls back to `window.location.origin` on the client
 * when the env var isn't set — there's no request-scoped origin on the
 * server without one, so the server fallback is an empty string.
 */
export function publicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/** Joins `publicOrigin()` with a path, e.g. "/o/acme" -> "https://signalhq.io/o/acme". */
export function buildPublicUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${publicOrigin()}${normalizedPath}`;
}
