import { describe, expect, it } from "vitest";
import { buildCsp, embedContext, sanitizeEmbedHeaders } from "./securityHeaders";

describe("buildCsp", () => {
  it("locks framing down everywhere by default", () => {
    const csp = buildCsp("test-nonce", { embed: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors *");
  });

  it("opens framing to any site for embed mode", () => {
    const csp = buildCsp("test-nonce", { embed: true });
    expect(csp).toContain("frame-ancestors *");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("defaults to the locked-down policy when no options are passed", () => {
    const csp = buildCsp("test-nonce");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("still includes the nonce and the rest of the policy in embed mode", () => {
    const csp = buildCsp("abc123", { embed: true });
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe("embedContext", () => {
  it("is not embed mode for an ordinary page, regardless of query params", () => {
    expect(embedContext("/dashboard")).toEqual({ embed: false, theme: "system" });
    expect(embedContext("/dashboard", new URLSearchParams("theme=dark"))).toEqual({
      embed: false,
      theme: "system",
    });
    // A spoofed path that merely contains "embed" but doesn't start with
    // "/embed/" must not count.
    expect(embedContext("/embedx")).toEqual({ embed: false, theme: "system" });
  });

  it("is embed mode under /embed/*", () => {
    expect(embedContext("/embed/o/acme")).toEqual({ embed: true, theme: "system" });
    expect(embedContext("/embed/q/some-slug")).toEqual({ embed: true, theme: "system" });
  });

  it("reads a valid theme from the query string", () => {
    expect(embedContext("/embed/q/x", new URLSearchParams("theme=light"))).toEqual({
      embed: true,
      theme: "light",
    });
    expect(embedContext("/embed/q/x", new URLSearchParams("theme=dark"))).toEqual({
      embed: true,
      theme: "dark",
    });
    expect(embedContext("/embed/q/x", new URLSearchParams("theme=system"))).toEqual({
      embed: true,
      theme: "system",
    });
  });

  it("falls back to system for a missing or invalid theme", () => {
    expect(embedContext("/embed/q/x")).toEqual({ embed: true, theme: "system" });
    expect(embedContext("/embed/q/x", new URLSearchParams("theme=purple"))).toEqual({
      embed: true,
      theme: "system",
    });
    expect(embedContext("/embed/q/x", new URLSearchParams(""))).toEqual({
      embed: true,
      theme: "system",
    });
  });

  it("also accepts a raw query string", () => {
    expect(embedContext("/embed/q/x", "theme=dark")).toEqual({ embed: true, theme: "dark" });
  });
});

describe("sanitizeEmbedHeaders", () => {
  it("strips any client-sent embed headers", () => {
    const headers = new Headers({
      "x-embed": "1",
      "x-embed-theme": "dark",
      "x-other": "keep-me",
    });
    sanitizeEmbedHeaders(headers);
    expect(headers.has("x-embed")).toBe(false);
    expect(headers.has("x-embed-theme")).toBe(false);
    expect(headers.get("x-other")).toBe("keep-me");
  });

  it("is a no-op when nothing is set", () => {
    const headers = new Headers({ "x-other": "keep-me" });
    sanitizeEmbedHeaders(headers);
    expect(headers.get("x-other")).toBe("keep-me");
  });
});
