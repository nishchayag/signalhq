import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { SecretBoxError, integrationsKeyConfigured, open, seal } from "@/lib/secretBox";

const GOOD_KEY = randomBytes(32).toString("base64");

afterEach(() => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
});

describe("integrationsKeyConfigured", () => {
  it("false when the key is missing", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect(integrationsKeyConfigured()).toBe(false);
  });

  it("false when the key isn't 32 bytes of base64", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
    expect(integrationsKeyConfigured()).toBe(false);
  });

  it("true for a well-formed 32-byte base64 key", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    expect(integrationsKeyConfigured()).toBe(true);
  });
});

describe("seal/open", () => {
  it("round-trips plaintext through the same org/integration/field", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = seal("https://hooks.slack.com/services/T0/B0/xxxx", "org1", "int1", "targetUrl");
    expect(open(blob, "org1", "int1", "targetUrl")).toBe(
      "https://hooks.slack.com/services/T0/B0/xxxx"
    );
  });

  it("produces a {v:1, iv, tag, ct} JSON blob with a fresh random IV each time", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const a = JSON.parse(seal("secret", "org1", "int1", "secret"));
    const b = JSON.parse(seal("secret", "org1", "int1", "secret"));
    expect(a).toMatchObject({ v: 1 });
    expect(typeof a.iv).toBe("string");
    expect(typeof a.tag).toBe("string");
    expect(typeof a.ct).toBe("string");
    expect(a.iv).not.toBe(b.iv);
  });

  it("throws seal/open when no key is configured", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect(() => seal("x", "org1", "int1", "targetUrl")).toThrow(SecretBoxError);
    expect(() => open("{}", "org1", "int1", "targetUrl")).toThrow(SecretBoxError);
  });

  it("rejects a tampered auth tag", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = JSON.parse(seal("secret", "org1", "int1", "secret"));
    const tagBytes = Buffer.from(blob.tag, "base64");
    tagBytes[0] ^= 0xff;
    blob.tag = tagBytes.toString("base64");
    expect(() => open(JSON.stringify(blob), "org1", "int1", "secret")).toThrow(SecretBoxError);
  });

  it("rejects a tampered IV", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = JSON.parse(seal("secret", "org1", "int1", "secret"));
    const ivBytes = Buffer.from(blob.iv, "base64");
    ivBytes[0] ^= 0xff;
    blob.iv = ivBytes.toString("base64");
    expect(() => open(JSON.stringify(blob), "org1", "int1", "secret")).toThrow(SecretBoxError);
  });

  it("rejects tampered ciphertext", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = JSON.parse(seal("secret", "org1", "int1", "secret"));
    const ctBytes = Buffer.from(blob.ct, "base64");
    ctBytes[0] ^= 0xff;
    blob.ct = ctBytes.toString("base64");
    expect(() => open(JSON.stringify(blob), "org1", "int1", "secret")).toThrow(SecretBoxError);
  });

  it("rejects the wrong AAD: different orgId, integrationId, or field", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = seal("secret", "org1", "int1", "secret");
    expect(() => open(blob, "org2", "int1", "secret")).toThrow(SecretBoxError);
    expect(() => open(blob, "org1", "int2", "secret")).toThrow(SecretBoxError);
    expect(() => open(blob, "org1", "int1", "targetUrl")).toThrow(SecretBoxError);
  });

  it("rejects a malformed blob", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    expect(() => open("not json", "org1", "int1", "secret")).toThrow(SecretBoxError);
    expect(() => open(JSON.stringify({ v: 2 }), "org1", "int1", "secret")).toThrow(SecretBoxError);
  });

  it("rejects a blob sealed under a different key", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = GOOD_KEY;
    const blob = seal("secret", "org1", "int1", "secret");
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => open(blob, "org1", "int1", "secret")).toThrow(SecretBoxError);
  });
});
