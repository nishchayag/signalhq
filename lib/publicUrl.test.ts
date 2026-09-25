import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPublicUrl, publicOrigin } from "@/lib/publicUrl";

describe("publicOrigin", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    // @ts-expect-error -- deliberately removing the jsdom-less global for the "no window" case
    delete global.window;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    // @ts-expect-error -- cleanup of the test-only global
    delete global.window;
  });

  it("prefers NEXT_PUBLIC_BASE_URL when set", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signalhq.io";
    expect(publicOrigin()).toBe("https://signalhq.io");
  });

  it("trims a trailing slash from NEXT_PUBLIC_BASE_URL", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signalhq.io/";
    expect(publicOrigin()).toBe("https://signalhq.io");
  });

  it("trims multiple trailing slashes", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signalhq.io///";
    expect(publicOrigin()).toBe("https://signalhq.io");
  });

  it("falls back to window.location.origin on the client when unset", () => {
    // @ts-expect-error -- minimal window stub for the client fallback path
    global.window = { location: { origin: "http://localhost:3000" } };
    expect(publicOrigin()).toBe("http://localhost:3000");
  });

  it("prefers the env var over window.location.origin", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signalhq.io";
    // @ts-expect-error -- minimal window stub
    global.window = { location: { origin: "http://localhost:3000" } };
    expect(publicOrigin()).toBe("https://signalhq.io");
  });

  it("returns an empty string on the server with no env var", () => {
    expect(publicOrigin()).toBe("");
  });
});

describe("buildPublicUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signalhq.io";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("joins the origin and a path that starts with a slash", () => {
    expect(buildPublicUrl("/o/acme")).toBe("https://signalhq.io/o/acme");
  });

  it("normalizes a path missing its leading slash", () => {
    expect(buildPublicUrl("o/acme")).toBe("https://signalhq.io/o/acme");
  });
});
