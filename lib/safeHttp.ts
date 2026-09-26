import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

// SSRF-safe HTTPS client for outbound integration deliveries (Slack/webhook
// targets, whose URL and reachability are ultimately controlled by whoever
// configured the integration). Two layers of defence:
//   1. validateTargetUrl — synchronous, string-level: https-only, port 443,
//      no userinfo, no IP-literal host (WHATWG's URL parser already folds
//      0x7f.1 / 2130706433 / octal forms into a canonical dotted address, so
//      a plain net.isIP check on the *parsed* hostname catches all of
//      those), plus the Slack host/path allowlist.
//   2. postJson's custom `lookup` — resolves the hostname with
//      `{ all: true }`, requires EVERY returned address to be public, and
//      pins the first one for the actual connection. This is what defeats
//      DNS rebinding (a hostname that resolves to a private/loopback/link-
//      local/metadata address at request time) — validateTargetUrl alone
//      can't catch this because a hostname (unlike a literal IP) can't be
//      judged safe from its string form.
// net.connect never calls a custom `lookup` for a literal IP host, so an
// IP-literal target would bypass layer 2 entirely — that's why layer 1
// rejects IP literals outright rather than relying on layer 2 alone.

export type TargetKind = "slack" | "webhook";

export class UrlNotAllowedError extends Error {
  constructor(message = "That URL is not allowed") {
    super(message);
    this.name = "UrlNotAllowedError";
  }
}

const SLACK_HOST = "hooks.slack.com";
const SLACK_PATH_PREFIX = "/services/";

function devLocalhostBypassAllowed(): boolean {
  return (
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST === "1" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  );
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Validate a target URL before it's ever stored or connected to. Throws
 * UrlNotAllowedError. Returns the parsed URL (WHATWG-normalised) so callers
 * use the same canonical hostname/path everywhere.
 */
export function validateTargetUrl(urlStr: string, kind: TargetKind): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new UrlNotAllowedError("Malformed URL");
  }

  if (url.username || url.password) {
    throw new UrlNotAllowedError("URL must not contain userinfo");
  }

  const hostname = stripBrackets(url.hostname).toLowerCase();

  const isDevLocalhost =
    kind === "webhook" &&
    devLocalhostBypassAllowed() &&
    url.protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1");

  if (!isDevLocalhost) {
    if (url.protocol !== "https:") {
      throw new UrlNotAllowedError("URL must use https");
    }
    const port = url.port ? Number(url.port) : 443;
    if (port !== 443) {
      throw new UrlNotAllowedError("URL must use port 443");
    }
    if (hostname === "localhost") {
      throw new UrlNotAllowedError("localhost is not an allowed host");
    }
    if (net.isIP(hostname) !== 0) {
      throw new UrlNotAllowedError("IP-literal hosts are not allowed");
    }
  }

  if (kind === "slack") {
    if (hostname !== SLACK_HOST) {
      throw new UrlNotAllowedError(`Slack URLs must be on ${SLACK_HOST}`);
    }
    if (!url.pathname.startsWith(SLACK_PATH_PREFIX)) {
      throw new UrlNotAllowedError(`Slack URLs must be under ${SLACK_PATH_PREFIX}`);
    }
  }

  return url;
}

// ---- Public-address checking (used at DNS-resolution time) -------------

type V4Range = [base: string, bits: number];

const PRIVATE_V4_RANGES: V4Range[] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT (RFC6598)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

function ipv4ToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, part) => (acc << 8) + (Number(part) & 0xff), 0) >>> 0
  );
}

function isPublicIpv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) return false;
  const n = ipv4ToInt(ip);
  return !PRIVATE_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/**
 * Parse any syntactically valid IPv6 literal (no brackets, no zone id) into
 * 16 bytes, including forms with a dotted-decimal tail (e.g.
 * "::ffff:127.0.0.1", "64:ff9b::1.2.3.4"). Returns null if the string isn't
 * a valid IPv6 address.
 */
function ipv6ToBytes(input: string): number[] | null {
  if (net.isIP(input) !== 6) return null;

  let hexPart = input;
  let v4: number[] | null = null;
  const v4Match = input.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) {
    hexPart = v4Match[1];
    const octets = v4Match[2].split(".").map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    v4 = octets;
    // Drop the single separating colon we just matched, unless it's part of
    // a "::" compression marker (in which case both colons must stay).
    if (!hexPart.endsWith("::")) hexPart = hexPart.slice(0, -1);
  }

  const hasDoubleColon = hexPart.includes("::");
  const [left = "", right = ""] = hexPart.split("::");
  const leftGroups = left ? left.split(":").filter(Boolean) : [];
  const rightGroups = right ? right.split(":").filter(Boolean) : [];
  const totalGroups = v4 ? 6 : 8;
  const missing = totalGroups - leftGroups.length - rightGroups.length;
  if (!hasDoubleColon && missing !== 0) return null;
  if (hasDoubleColon && missing < 0) return null;

  const groups = hasDoubleColon
    ? [...leftGroups, ...Array(missing).fill("0"), ...rightGroups]
    : leftGroups;
  if (groups.length !== totalGroups) return null;

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  if (v4) bytes.push(...v4);
  return bytes.length === 16 ? bytes : null;
}

const NAT64_PREFIX = [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0]; // 64:ff9b::/96

function isPublicIpv6(bytes: number[]): boolean {
  // :: (unspecified)
  if (bytes.every((b) => b === 0)) return false;
  // ::1 (loopback)
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return false;
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  // fc00::/7 unique local
  if ((bytes[0] & 0xfe) === 0xfc) return false;
  // ff00::/8 multicast
  if (bytes[0] === 0xff) return false;
  // ::ffff:0:0/96 — IPv4-mapped: check the embedded v4 address.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }
  // 64:ff9b::/96 — NAT64: check the embedded v4 address.
  if (NAT64_PREFIX.every((b, i) => bytes[i] === b)) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }
  // 2002::/16 — 6to4: the next 32 bits (bytes 2..6) embed the v4 address.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isPublicIpv4(bytes.slice(2, 6).join("."));
  }
  return true;
}

/** Whether `address` (a literal IPv4 or IPv6 string, brackets optional) is
 * publicly routable — used on every DNS-resolved address before connecting. */
export function isPublicAddress(address: string): boolean {
  const stripped = stripBrackets(address);
  const family = net.isIP(stripped);
  if (family === 4) return isPublicIpv4(stripped);
  if (family === 6) {
    const bytes = ipv6ToBytes(stripped);
    return bytes ? isPublicIpv6(bytes) : false;
  }
  return false;
}

/** Requires every resolved address to be public, then returns (pins) the
 * first one. Throws UrlNotAllowedError otherwise. */
export function pinPublicAddress(
  addresses: { address: string; family?: number }[]
): string {
  if (!addresses || addresses.length === 0) {
    throw new UrlNotAllowedError("DNS resolution returned no addresses");
  }
  for (const a of addresses) {
    if (!isPublicAddress(a.address)) {
      throw new UrlNotAllowedError("Resolved address is not publicly routable");
    }
  }
  return addresses[0].address;
}

// ---- The actual request --------------------------------------------------

export interface PostJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Test-only injection point. Bypasses the real network entirely. */
  transport?: Transport;
}

export type Transport = (
  url: URL,
  body: string,
  opts: { timeoutMs: number; headers?: Record<string, string> }
) => Promise<{ status: number }>;

const DEFAULT_TIMEOUT_MS = 5000;

/** The real transport: node:https (or node:http, dev-localhost bypass only)
 * with a custom `lookup` that pins a checked-public address. Exported so
 * tests can opt into exercising it explicitly (e.g. against a local test
 * server under the dev-localhost bypass) — see lib/safeHttp.test.ts. */
export const nodeTransport: Transport = (url, body, { timeoutMs, headers }) => {
  const isHttp = url.protocol === "http:";
  const mod = isHttp ? http : https;
  const hostname = stripBrackets(url.hostname);
  const port = url.port ? Number(url.port) : isHttp ? 80 : 443;

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      method: "POST",
      hostname,
      port,
      path: `${url.pathname}${url.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    };
    // The dev-localhost bypass (http://localhost|127.0.0.1) connects with
    // Node's default resolution: the host is already a literal loopback
    // address (or "localhost", which Node resolves locally), so there's no
    // rebinding surface to defend against, and it's gated to non-production.
    if (!isHttp) {
      options.lookup = (host, _opts, callback) => {
        dns.lookup(host, { all: true }, (err, addresses) => {
          if (err) {
            callback(err, "", 0);
            return;
          }
          try {
            const pinned = pinPublicAddress(addresses);
            callback(null, pinned, net.isIP(pinned));
          } catch (e) {
            callback(e as NodeJS.ErrnoException, "", 0);
          }
        });
      };
    }
    const req = mod.request(options, (res) => {
      const status = res.statusCode ?? 0;
      // Never read the body — it's untrusted and we only need the status.
      res.destroy();
      resolve({ status });
    });
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
};

/**
 * POST `body` (already-serialised JSON) to `urlStr`, validated for `kind`.
 * Never follows redirects (a 3xx is treated as a failure). Real network use
 * under Vitest throws unless `opts.transport` is supplied — mirrors
 * lib/ai.ts's provider guard.
 */
export async function postJson(
  urlStr: string,
  body: string,
  kind: TargetKind,
  opts: PostJsonOptions = {}
): Promise<{ status: number }> {
  const url = validateTargetUrl(urlStr, kind);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const transport =
    opts.transport ??
    (() => {
      if (process.env.VITEST) {
        throw new Error(
          "Real network used under Vitest — pass opts.transport to lib/safeHttp.ts#postJson."
        );
      }
      return nodeTransport;
    })();

  const { status } = await transport(url, body, { timeoutMs, headers: opts.headers });
  if (status >= 300 && status < 400) {
    throw new Error(`Redirect response (${status}) not followed`);
  }
  return { status };
}
