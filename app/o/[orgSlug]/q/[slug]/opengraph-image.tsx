import { getCanonicalQuestion, getPublicOrg } from "@/lib/publicLookups";
import { DEFAULT_BRANDING_ACCENT } from "@/lib/brandingConstants";
import { ACCENT_HEX, Chip, Highlight, OG_COLORS, clampText, renderOgCard } from "@/lib/ogCard";

export { OG_SIZE as size, OG_CONTENT_TYPE as contentType } from "@/lib/ogCard";
export const alt = "Answer anonymously on SignalHQ";

function questionFontSize(text: string): number {
  if (text.length <= 50) return 68;
  if (text.length <= 90) return 56;
  return 46;
}

// Mirrors the page's generateMetadata: the canonical question decides the
// org, and an internal question's wording never appears (members-only).
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const question = await getCanonicalQuestion(slug);
  const org = question ? await getPublicOrg(question.orgSlug) : null;
  const accent = ACCENT_HEX[org?.effectiveBranding?.accent ?? DEFAULT_BRANDING_ACCENT];
  const orgName = org ? clampText(org.name, 28) : null;
  const text = question && !question.internal ? clampText(question.questionText, 130) : null;

  return renderOgCard({
    eyebrow: orgName ? `${orgName} asks` : "Anonymous question",
    body: text ? (
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ display: "flex", width: 14, borderRadius: 7, background: accent, border: `3px solid ${OG_COLORS.ink}` }} />
        <div style={{ display: "flex", flex: 1, fontSize: questionFontSize(text), fontWeight: 900, letterSpacing: -2, lineHeight: 1.15, color: OG_COLORS.ink }}>
          {`“${text}”`}
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: OG_COLORS.muted }}>
          Answer a question anonymously for
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 900, letterSpacing: -3 }}>
          <Highlight color={accent}>{orgName ?? "this team"}</Highlight>
        </div>
      </div>
    ),
    badges: (
      <>
        <Chip label="Anonymous" color={ACCENT_HEX.pink} />
        <Chip label="No account needed" color={ACCENT_HEX.mint} />
      </>
    ),
  });
}
