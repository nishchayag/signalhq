import { createHash } from "crypto";
import type { NextRequest } from "next/server";

// Best-effort client IP for rate-limiting. IP-only keying conflates users
// behind a shared NAT/VPN — acceptable for early-access abuse mitigation,
// not precise per-person tracking.
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Keyed hash of the client IP for rate-limit keys, so the raw address never
 * lands in Mongo: sha256(NEXTAUTH_SECRET + ip), truncated to 32 hex chars
 * (128 bits — plenty to avoid collisions between clients). Salting with the
 * server secret stops anyone holding a DB dump from brute-forcing the small
 * IPv4 space back to addresses.
 */
export function hashedIp(request: NextRequest): string {
  return createHash("sha256")
    .update(`${process.env.NEXTAUTH_SECRET ?? ""}${getClientIp(request)}`)
    .digest("hex")
    .slice(0, 32);
}
