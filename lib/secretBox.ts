import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Envelope encryption for integration secrets (the Slack/webhook target URL
// and the webhook signing secret) at rest. AES-256-GCM with a random 12-byte
// IV per seal, keyed by INTEGRATIONS_ENCRYPTION_KEY (base64, must decode to
// exactly 32 bytes). The AAD binds the blob to `${orgId}:${integrationId}:
// ${field}` so a sealed blob can't be copied onto a different integration,
// org, or field (e.g. swapping a targetUrl blob for a secret blob) even if
// the ciphertext is otherwise readable.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

interface SealedBlob {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  ct: string; // base64
}

function loadKey(): Buffer | null {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  return key.length === KEY_LEN ? key : null;
}

function requireKey(): Buffer {
  const key = loadKey();
  if (!key) {
    throw new SecretBoxError(
      "INTEGRATIONS_ENCRYPTION_KEY is missing or is not 32 bytes of base64"
    );
  }
  return key;
}

/** Whether a usable encryption key is configured. Routes use this to return
 * 503 INTEGRATIONS_UNAVAILABLE instead of letting seal/open throw. */
export function integrationsKeyConfigured(): boolean {
  return loadKey() !== null;
}

function aad(orgId: string, integrationId: string, field: string): Buffer {
  return Buffer.from(`${orgId}:${integrationId}:${field}`, "utf8");
}

/** Encrypt `plaintext`, bound to (orgId, integrationId, field). Throws
 * SecretBoxError if no key is configured. */
export function seal(
  plaintext: string,
  orgId: string,
  integrationId: string,
  field: string
): string {
  const key = requireKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(aad(orgId, integrationId, field));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: SealedBlob = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
  return JSON.stringify(blob);
}

/** Decrypt a blob sealed with `seal`, bound to the same (orgId,
 * integrationId, field). Throws SecretBoxError on a missing key, a
 * malformed blob, a tampered tag/ciphertext, or a mismatched AAD. */
export function open(
  sealedBlob: string,
  orgId: string,
  integrationId: string,
  field: string
): string {
  const key = requireKey();
  let blob: SealedBlob;
  try {
    blob = JSON.parse(sealedBlob);
  } catch {
    throw new SecretBoxError("Malformed sealed blob (invalid JSON)");
  }
  if (
    !blob ||
    blob.v !== 1 ||
    typeof blob.iv !== "string" ||
    typeof blob.tag !== "string" ||
    typeof blob.ct !== "string"
  ) {
    throw new SecretBoxError("Malformed sealed blob (unexpected shape)");
  }
  let iv: Buffer, tag: Buffer, ct: Buffer;
  try {
    iv = Buffer.from(blob.iv, "base64");
    tag = Buffer.from(blob.tag, "base64");
    ct = Buffer.from(blob.ct, "base64");
  } catch {
    throw new SecretBoxError("Malformed sealed blob (invalid base64)");
  }
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAAD(aad(orgId, integrationId, field));
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    // Wrong key, tampered tag/ciphertext/iv, or mismatched AAD all surface
    // as an auth-tag failure from node:crypto — collapsed to one error so
    // callers can't distinguish "wrong AAD" from "tampered bytes".
    throw new SecretBoxError("Failed to open sealed blob (tampered, wrong key, or wrong context)");
  }
}
