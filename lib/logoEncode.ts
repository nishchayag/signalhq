// Browser-only helpers for the logo upload widget (BrandingSettings): resize
// to a small square-ish thumbnail via <canvas>, then encode as WebP —
// stepping quality down until the result fits the server's 100KB cap
// (lib/brandingConstants.ts#LOGO_MAX_BYTES) — with a PNG fallback for
// browsers where canvas.toBlob("image/webp") silently re-encodes as
// something else. Never imported by a server component; only called from
// an onChange handler inside a "use client" component.

const MAX_DIMENSION = 256;
const TARGET_BYTES = 100 * 1024;
const WEBP_QUALITIES = [0.92, 0.82, 0.7, 0.55, 0.4, 0.25];

export interface EncodedLogo {
  blob: Blob;
  contentType: "image/webp" | "image/png";
}

export class LogoEncodeError extends Error {}

function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Drawable = ImageBitmap | HTMLImageElement;

function dimensionsOf(img: Drawable): { width: number; height: number } {
  if (img instanceof HTMLImageElement) {
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
  return { width: img.width, height: img.height };
}

async function loadImage(file: File): Promise<{ img: Drawable; revoke?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      return { img: await createImageBitmap(file) };
    } catch {
      // Fall through to the <img> based loader below (older Safari, or a
      // format createImageBitmap refuses but <img> still decodes).
    }
  }
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new LogoEncodeError("That file isn't a readable image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new LogoEncodeError("Couldn't encode that image"))),
      type,
      quality
    );
  });
}

/** Encode at stepped-down WebP quality until under the cap; null if this
 * browser doesn't actually produce WebP (canvas.toBlob never rejects for an
 * unsupported type — it silently returns something else, so the returned
 * blob's own `.type` is the only reliable signal). */
async function tryEncodeWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const quality of WEBP_QUALITIES) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") return null;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= TARGET_BYTES) return blob;
  }
  return smallest;
}

/**
 * Resize `file` to fit within 256px on its longest side and encode it for
 * upload: WebP first (quality stepped down until it's under 100KB), PNG if
 * WebP isn't actually supported. Always returns *some* blob — if even the
 * smallest attempt is still over the cap, the caller uploads it anyway and
 * lets the server's own 100KB check (413) be the final word.
 */
export async function resizeAndEncodeLogo(file: File): Promise<EncodedLogo> {
  const { img, revoke } = await loadImage(file);
  try {
    const { width: srcW, height: srcH } = dimensionsOf(img);
    if (!srcW || !srcH) throw new LogoEncodeError("That file isn't a readable image");
    const { width, height } = fitWithin(srcW, srcH, MAX_DIMENSION);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new LogoEncodeError("Image editing isn't supported in this browser");
    ctx.drawImage(img, 0, 0, width, height);

    const webp = await tryEncodeWebp(canvas);
    if (webp && webp.size <= TARGET_BYTES) return { blob: webp, contentType: "image/webp" };

    const png = await canvasToBlob(canvas, "image/png");
    // Prefer whichever came out smaller when neither made it under the cap.
    if (webp && webp.size < png.size) return { blob: webp, contentType: "image/webp" };
    return { blob: png, contentType: "image/png" };
  } finally {
    revoke?.();
  }
}
