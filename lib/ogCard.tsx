import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { publicOrigin } from "@/lib/publicUrl";
import type { BrandingAccent } from "@/lib/brandingConstants";

// Link-preview cards (opengraph-image.tsx files). Satori can't read CSS
// variables, so the light-mode palette from app/globals.css is hardcoded here
// as hex — keep in sync if those tokens change.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const C = {
  bg: "#fbf6ec",
  card: "#fffdfa",
  ink: "#1d100b",
  muted: "#5f4f44",
  primary: "#573de0",
  onPrimary: "#fffdfa",
};
export const ACCENT_HEX: Record<BrandingAccent, string> = {
  yellow: "#f2d441",
  pink: "#ff7287",
  mint: "#4ae2ac",
  blue: "#3fb1ea",
};

let fonts: Promise<{ name: string; data: Buffer; weight: 600 | 900 }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([600, 900] as const).map(async (weight) => ({
      name: "Geist",
      weight,
      data: await readFile(join(process.cwd(), `assets/fonts/Geist-${weight}.ttf`)),
    }))
  );
  return fonts;
}

/** "https://signal.nishchayag.com" + path, without the scheme. */
export function displayUrl(path = ""): string {
  const host = publicOrigin().replace(/^https?:\/\//, "") || "signalhq";
  return `${host}${path}`;
}

/** Cuts at a word boundary and adds an ellipsis when over `max` chars. */
export function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect x="10" y="10" width="50" height="50" rx="14" fill={C.ink} />
      <rect x="4" y="4" width="50" height="50" rx="14" fill={ACCENT_HEX.yellow} stroke={C.ink} strokeWidth="4" />
      <path
        transform="translate(7.4 7.4) scale(1.8)"
        fill={C.ink}
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </svg>
  );
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        marginLeft: 18,
        padding: "10px 22px",
        background: color,
        border: `3px solid ${C.ink}`,
        borderRadius: 999,
        boxShadow: `4px 4px 0 ${C.ink}`,
        fontSize: 24,
        fontWeight: 900,
        color: C.ink,
      }}
    >
      {label}
    </div>
  );
}

/** Ink text on an accent block, like the `.highlight` utility. */
export function Highlight({ children, color }: { children: string; color: string }) {
  return (
    <span style={{ background: color, color: C.ink, padding: "0 18px", borderRadius: 18 }}>
      {children}
    </span>
  );
}

/**
 * The shared frame: cream page, one white sticker card with the
 * wordmark on top and `footer` (left: URL, right: `badges`) at the bottom.
 */
export async function renderOgCard({
  eyebrow,
  body,
  path,
  badges,
}: {
  eyebrow: string;
  body: React.ReactNode;
  path?: string;
  badges?: React.ReactNode;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "44px 58px 58px 44px",
          background: C.bg,
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "44px 56px",
            background: C.card,
            border: `4px solid ${C.ink}`,
            borderRadius: 32,
            boxShadow: `14px 14px 0 ${C.ink}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <LogoMark size={60} />
              <div style={{ display: "flex", fontSize: 40, fontWeight: 900, letterSpacing: -1, color: C.ink }}>
                Signal<span style={{ color: C.primary }}>HQ</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 3,
                color: C.muted,
              }}
            >
              {eyebrow.toUpperCase()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>{body}</div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                flex: 1,
                marginRight: 32,
                fontSize: 26,
                fontWeight: 600,
                color: C.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayUrl(path)}
            </div>
            <div style={{ display: "flex", flexShrink: 0 }}>{badges}</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() }
  );
}

export const OG_COLORS = C;
