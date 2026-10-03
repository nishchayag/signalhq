import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  UrlNotAllowedError,
  isPublicAddress,
  nodeTransport,
  pinPublicAddress,
  postJson,
  validateTargetUrl,
} from "@/lib/safeHttp";

// The dev-localhost bypass is off under NODE_ENV=production, which Vercel's
// build sets while running this suite, so pin a non-production NODE_ENV.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST;
  delete process.env.VERCEL;
});

describe("validateTargetUrl", () => {
  it("accepts a well-formed Slack webhook URL", () => {
    const url = validateTargetUrl("https://hooks.slack.com/services/T0/B0/xxxxxxxx", "slack");
    expect(url.hostname).toBe("hooks.slack.com");
  });

  it("accepts a well-formed generic webhook URL", () => {
    const url = validateTargetUrl("https://example.com/hooks/signalhq", "webhook");
    expect(url.hostname).toBe("example.com");
  });

  it("rejects a malformed URL", () => {
    expect(() => validateTargetUrl("not a url", "webhook")).toThrow(UrlNotAllowedError);
  });

  it("rejects http (non-https, no dev bypass)", () => {
    expect(() => validateTargetUrl("http://example.com/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
  });

  it("rejects a non-443 port", () => {
    expect(() => validateTargetUrl("https://example.com:8443/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
  });

  it("rejects userinfo in the URL", () => {
    expect(() => validateTargetUrl("https://user:pass@example.com/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
  });

  it("rejects a Slack URL on the wrong host, including a lookalike suffix", () => {
    expect(() =>
      validateTargetUrl("https://hooks.slack.com.evil.com/services/T0/B0/x", "slack")
    ).toThrow(UrlNotAllowedError);
  });

  it("rejects a Slack URL not under /services/", () => {
    expect(() => validateTargetUrl("https://hooks.slack.com/other/T0", "slack")).toThrow(
      UrlNotAllowedError
    );
  });

  describe("rejects every IP-literal / loopback bypass form", () => {
    const forms = [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://0x7f.1/x", // WHATWG-normalises to 127.0.0.1
      "https://2130706433/x", // decimal
      "https://017700000001/x", // octal
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://169.254.169.254/x", // cloud metadata
      "https://[64:ff9b::7f00:1]/x", // NAT64-embedded 127.0.0.1
      "https://[2002:7f00:0001::]/x", // 6to4-embedded 127.0.0.1
    ];
    for (const form of forms) {
      it(form, () => {
        expect(() => validateTargetUrl(form, "webhook")).toThrow(UrlNotAllowedError);
      });
    }
  });

  it("the dev-localhost bypass allows http://localhost and http://127.0.0.1 with the env flag, webhook only", () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    expect(validateTargetUrl("http://127.0.0.1:4555/hook", "webhook").hostname).toBe("127.0.0.1");
    expect(validateTargetUrl("http://localhost:4555/hook", "webhook").hostname).toBe("localhost");
    // Never for Slack, even with the flag set.
    expect(() => validateTargetUrl("http://127.0.0.1:4555/hook", "slack")).toThrow(
      UrlNotAllowedError
    );
  });

  it("the dev-localhost bypass is ignored when NODE_ENV=production", () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(() => validateTargetUrl("http://127.0.0.1:4555/hook", "webhook")).toThrow(
        UrlNotAllowedError
      );
    } finally {
      env.NODE_ENV = original;
    }
  });

  it("the dev-localhost bypass is ignored when VERCEL is set", () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    process.env.VERCEL = "1";
    expect(() => validateTargetUrl("http://127.0.0.1:4555/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
  });

  it("without the flag, localhost forms are rejected even under a non-production NODE_ENV", () => {
    expect(() => validateTargetUrl("http://127.0.0.1:4555/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
    expect(() => validateTargetUrl("http://localhost:4555/hook", "webhook")).toThrow(
      UrlNotAllowedError
    );
  });
});

describe("isPublicAddress", () => {
  it("flags private/loopback/link-local/CGNAT IPv4 as not public", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("public IPv4 addresses are public", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("flags loopback/link-local/ULA IPv6 as not public", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "ff02::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("decodes an IPv4-mapped IPv6 address and checks the embedded v4", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("decodes a NAT64 (64:ff9b::/96) address and checks the embedded v4", () => {
    expect(isPublicAddress("64:ff9b::7f00:1")).toBe(false); // embeds 127.0.0.1
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true); // embeds 8.8.8.8
  });

  it("decodes a 6to4 (2002::/16) address and checks the embedded v4", () => {
    expect(isPublicAddress("2002:7f00:1::")).toBe(false); // embeds 127.0.0.1
    expect(isPublicAddress("2002:0808:0808::")).toBe(true); // embeds 8.8.8.8
  });

  it("a genuine public IPv6 address is public", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("brackets are stripped", () => {
    expect(isPublicAddress("[::1]")).toBe(false);
  });

  it("a non-IP string is not public", () => {
    expect(isPublicAddress("example.com")).toBe(false);
  });
});

describe("pinPublicAddress", () => {
  it("returns the first address when every address is public", () => {
    expect(
      pinPublicAddress([
        { address: "8.8.8.8", family: 4 },
        { address: "8.8.4.4", family: 4 },
      ])
    ).toBe("8.8.8.8");
  });

  it("throws if any resolved address is private (DNS-rebinding defence)", () => {
    expect(() =>
      pinPublicAddress([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ])
    ).toThrow(UrlNotAllowedError);
  });

  it("throws on an empty address list", () => {
    expect(() => pinPublicAddress([])).toThrow(UrlNotAllowedError);
  });
});

describe("postJson", () => {
  it("throws under Vitest when no transport is injected (network guard)", async () => {
    await expect(postJson("https://example.com/hook", "{}", "webhook")).rejects.toThrow(
      /Vitest/
    );
  });

  it("validates the URL before ever calling the transport", async () => {
    const transport = async () => ({ status: 200 });
    await expect(
      postJson("http://example.com/hook", "{}", "webhook", { transport })
    ).rejects.toThrow(UrlNotAllowedError);
  });

  it("treats a 3xx response as a failure (redirects are never followed)", async () => {
    const transport = async () => ({ status: 302 });
    await expect(
      postJson("https://example.com/hook", "{}", "webhook", { transport })
    ).rejects.toThrow(/redirect/i);
  });

  it("resolves with the status for a non-redirect response", async () => {
    const transport = async () => ({ status: 200 });
    await expect(
      postJson("https://example.com/hook", "{}", "webhook", { transport })
    ).resolves.toEqual({ status: 200 });

    const transportFail = async () => ({ status: 404 });
    await expect(
      postJson("https://example.com/hook", "{}", "webhook", { transport: transportFail })
    ).resolves.toEqual({ status: 404 });
  });

  it("passes custom headers through to the transport", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const transport = async (_url: URL, _body: string, opts: { headers?: Record<string, string> }) => {
      seenHeaders = opts.headers;
      return { status: 200 };
    };
    await postJson("https://example.com/hook", "{}", "webhook", {
      transport,
      headers: { "X-Test": "1" },
    });
    expect(seenHeaders).toMatchObject({ "X-Test": "1" });
  });

  it("propagates a timeout/network error from the transport", async () => {
    const transport = async () => {
      throw new Error("timeout");
    };
    await expect(
      postJson("https://example.com/hook", "{}", "webhook", { transport })
    ).rejects.toThrow(/timeout/);
  });
});

describe("nodeTransport against a real local server (dev bypass)", () => {
  function withServer(
    handler: http.RequestListener
  ): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${port}/hook`,
          close: () => new Promise((r) => server.close(() => r())),
        });
      });
    });
  }

  it("delivers a request and reads only the status, ignoring the body", async () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    const { url, close } = await withServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    try {
      const res = await postJson(url, JSON.stringify({ hello: "world" }), "webhook", {
        transport: nodeTransport,
      });
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });

  it("treats a slow response past the timeout as a failure", async () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    const { url, close } = await withServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 500);
    });
    try {
      await expect(
        postJson(url, "{}", "webhook", { transport: nodeTransport, timeoutMs: 50 })
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("a 302 from the real server is treated as a failure", async () => {
    process.env.INTEGRATIONS_DEV_ALLOW_LOCALHOST = "1";
    const { url, close } = await withServer((_req, res) => {
      res.writeHead(302, { Location: "https://evil.example/" });
      res.end();
    });
    try {
      await expect(
        postJson(url, "{}", "webhook", { transport: nodeTransport })
      ).rejects.toThrow(/redirect/i);
    } finally {
      await close();
    }
  });
});
