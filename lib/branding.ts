import {
  BRANDING_ACCENTS,
  DEFAULT_BRANDING_ACCENT,
  type BrandingAccent,
} from "@/lib/brandingConstants";
import { hasFeature, type Plan } from "@/lib/plans";
import OrgAssetModel from "@/models/orgAsset.model";

type OrgBrandingSource = {
  branding?: {
    accent?: string;
    welcomeText?: string;
    logoVersion?: number;
  } | null;
};

export interface BrandingView {
  accent: BrandingAccent;
  welcomeText: string;
  logoVersion: number;
}

function isBrandingAccent(v: unknown): v is BrandingAccent {
  return typeof v === "string" && (BRANDING_ACCENTS as readonly string[]).includes(v);
}

/**
 * The org's stored branding settings, with defaults filled in for whatever
 * is missing — for the settings UI (owner/admin), which always sees the raw
 * stored values regardless of plan. Never touches OrgAsset.
 */
export function brandingView(org: OrgBrandingSource): BrandingView {
  const accent = org.branding?.accent;
  return {
    accent: isBrandingAccent(accent) ? accent : DEFAULT_BRANDING_ACCENT,
    welcomeText: org.branding?.welcomeText ?? "",
    logoVersion: org.branding?.logoVersion ?? 0,
  };
}

export interface EffectiveBranding {
  accent: BrandingAccent;
  welcomeText: string;
  // A URL, never bytes — the public logo route is what actually serves the
  // image. null when there's no logo (or plan gating hides it).
  logoUrl: string | null;
}

/**
 * Branding as PUBLIC pages should render it: null unless the org's CURRENT
 * plan allows branding (PLAN_FEATURES.branding) — a downgrade keeps the
 * stored data but stops it from rendering, no destructive migration needed.
 *
 * Only ever checks whether an OrgAsset row exists (no bytes touched, since
 * the `bytes` field is select:false and this never asks for "+bytes"), so a
 * stale logoVersion left over from a deleted logo can't produce a broken
 * image link — the URL is only returned when the asset actually exists.
 *
 * Callers must have already called connectDB().
 */
export async function getEffectiveBranding(
  org: OrgBrandingSource & { _id: unknown; slug: string; plan: Plan }
): Promise<EffectiveBranding | null> {
  if (!hasFeature(org.plan, "branding")) return null;
  const view = brandingView(org);
  let logoUrl: string | null = null;
  if (view.logoVersion > 0) {
    const exists = await OrgAssetModel.exists({ organizationId: org._id, kind: "logo" });
    if (exists) logoUrl = `/api/o/${org.slug}/logo?v=${view.logoVersion}`;
  }
  return { accent: view.accent, welcomeText: view.welcomeText, logoUrl };
}
