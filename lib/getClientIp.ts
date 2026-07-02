import type { NextRequest } from "next/server";

// Best-effort client IP for rate-limiting. IP-only keying conflates users
// behind a shared NAT/VPN — acceptable for early-access abuse mitigation,
// not precise per-person tracking.
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
