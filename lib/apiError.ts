import axios from "axios";

/**
 * The human-readable reason from a failed request, for toasts and inline
 * errors. Axios throws on any non-2xx, so the server's own explanation
 * ("Your FREE plan allows up to 2 teams…") lives on the error, not the
 * response — catch blocks that just toast a generic string throw it away.
 *
 * Reads `message` first, then `error`: auth routes respond `{ error }`,
 * everything else `{ message }`. Network failures (no response) and
 * anything unrecognised fall back to `fallback`.
 */
export function apiError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { message?: unknown; error?: unknown } | undefined;
    const msg = data?.message ?? data?.error;
    return typeof msg === "string" && msg.trim() ? msg : fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
