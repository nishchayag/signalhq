import type { LogoContentType } from "@/lib/brandingConstants";

// Magic-byte sniffing for org logo uploads. The client's Content-Type header
// and filename/extension are never trusted — every byte here is read from
// the buffer itself. Deliberately strict: each format validator walks the
// container structure end-to-end and requires the file to end exactly where
// the format says it should, which is what catches "valid image plus
// trailing/appended payload" polyglots (HTML-in-PNG, a ZIP appended after a
// JPEG's EOI, etc.) rather than only checking the leading signature.

export type LogoSniffResult =
  | { ok: true; contentType: LogoContentType }
  | { ok: false; reason: string };

// Belt-and-suspenders scan for HTML/script signatures anywhere in the byte
// stream — not just at the start. A well-formed ancillary chunk (PNG tEXt/
// iTXt, JPEG COM, WebP EXIF/XMP) can carry attacker-controlled bytes without
// breaking the container's own structural validity, so the per-format
// walkers below can't catch it by themselves. latin1 maps each byte to one
// char 1:1 and never throws on arbitrary binary input.
const FORBIDDEN_MARKUP = [
  /<\s*script[\s>/]/i,
  /<\/\s*script/i,
  /<\s*svg[\s>/]/i,
  /<\s*html[\s>/]/i,
  /<!doctype\s+html/i,
  /<\s*iframe[\s>/]/i,
  /<\?xml/i,
  /javascript:/i,
];

function containsForbiddenMarkup(buf: Buffer): boolean {
  const text = buf.toString("latin1");
  if (FORBIDDEN_MARKUP.some((re) => re.test(text))) return true;
  // ASCII markup encoded as UTF-16 (either endianness) inside an ancillary
  // chunk reads as plain text interleaved with NUL bytes under latin1, so
  // the scan above never matches it. Stripping every NUL byte collapses
  // both UTF-16LE and UTF-16BE encodings of ASCII text down to the same
  // latin1 string, without needing to detect or decode the specific
  // variant.
  const stripped = Buffer.from(buf.filter((byte) => byte !== 0)).toString("latin1");
  return FORBIDDEN_MARKUP.some((re) => re.test(stripped));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Walk PNG chunks from the signature to IEND. Rejects anything truncated
 * (a chunk claims more data than the buffer has) and anything with trailing
 * bytes after IEND (IEND must be the terminal chunk of a well-formed PNG).
 */
function isValidPng(buf: Buffer): boolean {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const chunkEnd = pos + 8 + length + 4; // len(4) + type(4) + data(length) + crc(4)
    if (length < 0 || chunkEnd > buf.length) return false; // truncated / malformed
    if (type === "IEND") return chunkEnd === buf.length; // must be the last chunk
    pos = chunkEnd;
  }
  return false; // ran off the end without ever seeing IEND
}

/**
 * Walk JPEG markers from SOI to EOI, including scanning past entropy-coded
 * scan data (which is not itself a sequence of markers) to find the real
 * next marker. Rejects anything truncated and anything with trailing bytes
 * after EOI.
 */
function isValidJpeg(buf: Buffer): boolean {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let pos = 2;
  while (pos < buf.length) {
    if (buf[pos] !== 0xff) return false;
    let markerPos = pos + 1;
    // 0xFF fill/padding bytes are legal before a marker byte.
    while (markerPos < buf.length && buf[markerPos] === 0xff) markerPos++;
    if (markerPos >= buf.length) return false;
    const marker = buf[markerPos];
    pos = markerPos + 1;

    if (marker === 0xd9) return pos === buf.length; // EOI must be the end
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // TEM / RSTn: no payload

    if (pos + 2 > buf.length) return false;
    const segLength = buf.readUInt16BE(pos);
    if (segLength < 2 || pos + segLength > buf.length) return false;
    const segEnd = pos + segLength;

    if (marker === 0xda) {
      // SOS: header ends at segEnd, then entropy-coded data follows until
      // the next real marker. 0xFF00 is a stuffed literal 0xFF byte inside
      // the scan and 0xFFD0-0xFFD7 are restart markers embedded in the
      // scan — both are skipped rather than treated as "the next marker".
      let scanPos = segEnd;
      while (scanPos < buf.length) {
        if (buf[scanPos] !== 0xff) {
          scanPos++;
          continue;
        }
        const next = buf[scanPos + 1];
        if (next === undefined) return false;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scanPos += 2;
          continue;
        }
        break;
      }
      pos = scanPos;
      continue;
    }
    pos = segEnd;
  }
  return false; // ran off the end without ever seeing EOI
}

/**
 * RIFF/WEBP: the container's own size field is authoritative — it must
 * equal exactly `buf.length - 8`, so both truncation (actual < declared) and
 * a trailing/appended payload (actual > declared) are caught by one strict
 * equality check.
 */
function isValidWebp(buf: Buffer): boolean {
  if (buf.length < 16) return false;
  if (buf.toString("latin1", 0, 4) !== "RIFF") return false;
  if (buf.toString("latin1", 8, 12) !== "WEBP") return false;
  const declaredSize = buf.readUInt32LE(4);
  if (declaredSize + 8 !== buf.length) return false;
  const fourCc = buf.toString("latin1", 12, 16);
  return fourCc === "VP8 " || fourCc === "VP8L" || fourCc === "VP8X";
}

/**
 * Sniff `buf` as an org logo: PNG, JPEG or WebP only, verified by magic
 * bytes and full-container validation — never by the client's declared
 * Content-Type or filename extension.
 */
export function sniffLogoBytes(buf: Buffer): LogoSniffResult {
  if (buf.length === 0) return { ok: false, reason: "The uploaded file is empty" };
  // Checked up front regardless of format: catches markup smuggled inside a
  // structurally valid ancillary chunk, which the walkers below wouldn't see.
  if (containsForbiddenMarkup(buf)) {
    return { ok: false, reason: "That file isn't a supported image" };
  }
  if (isValidPng(buf)) return { ok: true, contentType: "image/png" };
  if (isValidJpeg(buf)) return { ok: true, contentType: "image/jpeg" };
  if (isValidWebp(buf)) return { ok: true, contentType: "image/webp" };
  return { ok: false, reason: "Only PNG, JPEG or WebP images are allowed" };
}
