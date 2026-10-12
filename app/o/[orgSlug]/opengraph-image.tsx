import { getPublicOrg } from "@/lib/publicLookups";
import { DEFAULT_BRANDING_ACCENT } from "@/lib/brandingConstants";
import { ACCENT_HEX, Chip, Highlight, OG_COLORS, clampText, renderOgCard } from "@/lib/ogCard";

export { OG_SIZE as size, OG_CONTENT_TYPE as contentType } from "@/lib/ogCard";
export const alt = "Send anonymous feedback on SignalHQ";

/** Shrinks the headline so long names still fit on one or two lines. */
function nameFontSize(name: string): number {
  if (name.length <= 14) return 104;
  if (name.length <= 22) return 84;
  return 64;
}

// The org's own accent when its plan includes branding, else brand yellow.
// An unknown slug still gets a (generic) card rather than a broken image.
export default async function Image({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getPublicOrg(orgSlug);
  const accent = ACCENT_HEX[org?.effectiveBranding?.accent ?? DEFAULT_BRANDING_ACCENT];
  const name = org ? clampText(org.name, 40) : "your team";
  return renderOgCard({
    eyebrow: "Anonymous feedback",
    path: org ? `/o/${org.slug}` : "",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: OG_COLORS.muted }}>
          Send honest, anonymous feedback to
        </div>
        <div style={{ display: "flex", fontSize: nameFontSize(name), fontWeight: 900, letterSpacing: -3, lineHeight: 1.1 }}>
          <Highlight color={accent}>{name}</Highlight>
        </div>
      </div>
    ),
    badges: (
      <>
        <Chip label="No names" color={ACCENT_HEX.pink} />
        <Chip label="No account needed" color={ACCENT_HEX.mint} />
      </>
    ),
  });
}
