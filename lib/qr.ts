/**
 * QR code rendering, on top of `qrcode-generator` (zero dependencies).
 * Loaded via a dynamic `import()` so the module is only fetched once a
 * share dialog actually opens, not on every page that could show one.
 */

/** Standard QR "quiet zone" is 4 modules; keep that ratio at any cell size. */
const QUIET_ZONE_MODULES = 4;

/**
 * Renders `text` as an SVG QR code: black modules on a white background
 * with a quiet zone, so it stays scannable (dark-on-light) regardless of
 * the app's light/dark theme.
 */
export async function buildQrSvg(text: string, cellSize = 8): Promise<string> {
  const qrcodeModule = await import("qrcode-generator");
  const qrcode = qrcodeModule.default;
  // Type number 0 lets the library pick the smallest size that fits the
  // data; "M" (~15% error correction) is the standard default.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: cellSize * QUIET_ZONE_MODULES });
}

/** Wraps raw SVG markup in a `data:` URL suitable for an `<img src>`. */
export function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Rasterizes an SVG data URL to a PNG data URL via an off-screen canvas, at
 * `size` pixels square (default ~1024px so the download is crisp even when
 * printed). Must run in the browser (uses `Image`/`document.createElement`).
 */
export async function svgDataUrlToPngDataUrl(svgDataUrl: string, size = 1024): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to rasterize QR code"));
  });
  image.src = svgDataUrl;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");

  // White background first: PNG has no implicit background, and this keeps
  // the export dark-on-light even if a viewer's image tool adds padding.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false; // crisp modules, no blur when upscaling
  ctx.drawImage(image, 0, 0, size, size);

  return canvas.toDataURL("image/png");
}
