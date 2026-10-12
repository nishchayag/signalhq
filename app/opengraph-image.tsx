import { ACCENT_HEX, Chip, Highlight, OG_COLORS, renderOgCard } from "@/lib/ogCard";

export { OG_SIZE as size, OG_CONTENT_TYPE as contentType } from "@/lib/ogCard";
export const alt = "SignalHQ: hear what they won't say to your face";

export default function Image() {
  return renderOgCard({
    eyebrow: "Anonymous feedback",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 82, fontWeight: 900, letterSpacing: -3, lineHeight: 1.08, color: OG_COLORS.ink }}>
        <div style={{ display: "flex" }}>Hear what they</div>
        <div style={{ display: "flex" }}>
          <Highlight color={ACCENT_HEX.yellow}>won&apos;t say to your face.</Highlight>
        </div>
      </div>
    ),
    badges: (
      <>
        <Chip label="No names" color={ACCENT_HEX.pink} />
        <Chip label="No accounts" color={ACCENT_HEX.mint} />
      </>
    ),
  });
}
