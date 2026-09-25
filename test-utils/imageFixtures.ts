// Minimal real (decodable) image byte fixtures for logo-upload tests, plus
// builders for the malformed/malicious variants the validator must reject.
import { deflateSync } from "node:zlib";

// A tiny, valid, fully-decodable 1x1 baseline JPEG (a well-known minimal
// fixture reused across many test suites).
const VALID_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

// PNG's CRC32 (polynomial 0xEDB88320), computed for real rather than
// hardcoded — building a spec-correct PNG at test time (instead of trusting
// a copy-pasted "smallest known PNG" base64 blob, several of which
// circulating online turn out to have an inconsistent IDAT chunk length)
// is what makes the strict, real chunk-walking validator in
// lib/logoValidation.ts something worth testing against.
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** A real, spec-correct, decodable 1x1 RGBA PNG. */
export function validPng(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk("IHDR", ihdrData);
  const scanline = Buffer.from([0, 255, 0, 0, 255]); // filter byte + one red pixel
  const idat = pngChunk("IDAT", deflateSync(scanline));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

export function validJpeg(): Buffer {
  return Buffer.from(VALID_JPEG_B64, "base64");
}

/**
 * A minimal but structurally valid WebP: a RIFF/WEBP container whose size
 * field exactly matches the buffer, wrapping one "VP8 " chunk. The chunk's
 * payload isn't a real VP8 bitstream (decoding actual pixels is out of scope
 * for a backend upload guard) — only the container-level structure that
 * lib/logoValidation.ts#isValidWebp actually checks needs to be genuine.
 */
export function validWebp(): Buffer {
  const chunkData = Buffer.from([0, 0, 0, 0]); // even length, no padding needed
  const chunk = Buffer.concat([
    Buffer.from("VP8 ", "latin1"),
    uint32le(chunkData.length),
    chunkData,
  ]);
  const riffPayload = Buffer.concat([Buffer.from("WEBP", "latin1"), chunk]);
  return Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    uint32le(riffPayload.length),
    riffPayload,
  ]);
}

function uint32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/**
 * A structurally valid PNG carrying a tEXt chunk whose payload is `text`
 * encoded as UTF-16 (LE or BE) rather than the tEXt spec's Latin-1 — used to
 * test that the forbidden-markup scan catches markup smuggled past a
 * latin1-only byte scan by way of UTF-16 encoding.
 */
export function pngWithUtf16TextChunk(text: string, endianness: "LE" | "BE" = "LE"): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk("IHDR", ihdrData);
  const scanline = Buffer.from([0, 255, 0, 0, 255]); // filter byte + one red pixel
  const idat = pngChunk("IDAT", deflateSync(scanline));

  const le = Buffer.from(text, "utf16le");
  const encoded = endianness === "LE" ? le : swapEndian16(le);
  const textChunk = pngChunk("tEXt", encoded);
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, textChunk, iend]);
}

function swapEndian16(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) {
    const tmp = out[i];
    out[i] = out[i + 1];
    out[i + 1] = tmp;
  }
  return out;
}

export function disguisedSvg(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
}

/** A structurally valid PNG with an HTML/script payload appended after IEND. */
export function pngWithTrailingHtml(): Buffer {
  return Buffer.concat([validPng(), Buffer.from("<script>alert(1)</script>", "utf8")]);
}

/** A structurally valid JPEG with data appended after the EOI marker. */
export function jpegWithTrailingData(): Buffer {
  return Buffer.concat([validJpeg(), Buffer.from([0xde, 0xad, 0xbe, 0xef])]);
}

/** Cuts a buffer short — simulates an interrupted/truncated upload. */
export function truncated(buf: Buffer, dropLastBytes = 10): Buffer {
  return buf.subarray(0, Math.max(0, buf.length - dropLastBytes));
}

/** A single-part multipart/form-data body for the "file" field. */
export function multipartBody(
  fileBytes: Buffer,
  opts: { filename?: string; contentType?: string; boundary?: string; fieldName?: string } = {}
): { body: Buffer; contentType: string } {
  const boundary = opts.boundary ?? "----vitestBoundary1234567890";
  const filename = opts.filename ?? "logo.png";
  const partContentType = opts.contentType ?? "image/png";
  const fieldName = opts.fieldName ?? "file";
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${partContentType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([head, fileBytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
