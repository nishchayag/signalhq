import RateLimitHitModel from "@/models/rateLimitHit.model";

/**
 * Fixed-window rate limiter backed by Mongo (no Redis/Upstash in this stack
 * yet). Returns true if the call is allowed, false if `limit` has been
 * exceeded for this window.
 *
 * Two simultaneous first-hit requests for the same (key, windowStart) can
 * both attempt to upsert-insert, and MongoDB will reject the loser with an
 * E11000 duplicate-key error (unique index on {key, windowStart}) — this is
 * normal under concurrency, not a bug. On that error we retry once; the
 * retried `findOneAndUpdate` finds the doc the winner just inserted and
 * correctly increments it instead.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs + 60_000);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await RateLimitHitModel.findOneAndUpdate(
        { key, windowStart },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true }
      );
      return doc.count <= limit;
    } catch (error) {
      const isDuplicateKey =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000;
      if (isDuplicateKey && attempt === 0) continue;
      throw error;
    }
  }
  // Unreachable, but keeps TypeScript happy about the loop's return type.
  return false;
}
