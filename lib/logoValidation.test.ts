import { describe, expect, it } from "vitest";
import { sniffLogoBytes } from "@/lib/logoValidation";
import {
  disguisedSvg,
  jpegWithTrailingData,
  pngWithTrailingHtml,
  truncated,
  validJpeg,
  validPng,
  validWebp,
} from "@/test-utils/imageFixtures";

describe("sniffLogoBytes", () => {
  it("accepts a valid PNG", () => {
    expect(sniffLogoBytes(validPng())).toEqual({ ok: true, contentType: "image/png" });
  });

  it("accepts a valid JPEG", () => {
    expect(sniffLogoBytes(validJpeg())).toEqual({ ok: true, contentType: "image/jpeg" });
  });

  it("accepts a valid WebP", () => {
    expect(sniffLogoBytes(validWebp())).toEqual({ ok: true, contentType: "image/webp" });
  });

  it("rejects raw SVG bytes regardless of what the caller claims they are", () => {
    const result = sniffLogoBytes(disguisedSvg());
    expect(result.ok).toBe(false);
  });

  it("rejects a PNG with an HTML/script payload appended after IEND (polyglot)", () => {
    const result = sniffLogoBytes(pngWithTrailingHtml());
    expect(result.ok).toBe(false);
  });

  it("rejects a JPEG with arbitrary bytes appended after EOI", () => {
    const result = sniffLogoBytes(jpegWithTrailingData());
    expect(result.ok).toBe(false);
  });

  it("rejects a truncated PNG", () => {
    expect(sniffLogoBytes(truncated(validPng())).ok).toBe(false);
  });

  it("rejects a truncated JPEG", () => {
    expect(sniffLogoBytes(truncated(validJpeg())).ok).toBe(false);
  });

  it("rejects a truncated WebP", () => {
    expect(sniffLogoBytes(truncated(validWebp(), 2)).ok).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(sniffLogoBytes(Buffer.alloc(0)).ok).toBe(false);
  });

  it("rejects plain text", () => {
    expect(sniffLogoBytes(Buffer.from("just some text", "utf8")).ok).toBe(false);
  });

  it("rejects an HTML document even without any image-like prefix", () => {
    expect(sniffLogoBytes(Buffer.from("<!doctype html><html><body>hi</body></html>", "utf8")).ok).toBe(
      false
    );
  });

  it("a WebP whose declared RIFF size doesn't match the actual length is rejected", () => {
    const buf = validWebp();
    const tampered = Buffer.from(buf);
    tampered.writeUInt32LE(tampered.readUInt32LE(4) + 100, 4); // lie about the size
    expect(sniffLogoBytes(tampered).ok).toBe(false);
  });
});
