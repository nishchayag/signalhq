// Client-safe branding helpers — shared by the public pages' branded
// header and the dashboard settings UI. Deliberately doesn't import
// lib/branding.ts (which pulls in the mongoose OrgAsset model) or
// models/organization.model.ts; only lib/brandingConstants.ts, which is
// itself mongoose-free for exactly this reason.
import { BRANDING_ACCENTS, type BrandingAccent } from "@/lib/brandingConstants";

export { BRANDING_ACCENTS };
export type { BrandingAccent };

// Accent key -> the existing bg-brand-* utility class. A static map, not
// string interpolation — Tailwind only picks up literal class names.
export const ACCENT_BG: Record<BrandingAccent, string> = {
  yellow: "bg-brand-yellow",
  pink: "bg-brand-pink",
  mint: "bg-brand-mint",
  blue: "bg-brand-blue",
};

export const ACCENT_LABEL: Record<BrandingAccent, string> = {
  yellow: "Yellow",
  pink: "Pink",
  mint: "Mint",
  blue: "Blue",
};

/**
 * Structurally identical to lib/branding.ts#EffectiveBranding (a server-side
 * export a client component must never import directly). Used for both the
 * real public-page branding and the settings page's live draft preview.
 */
export interface PublicBranding {
  accent: BrandingAccent;
  welcomeText: string;
  logoUrl: string | null;
}
