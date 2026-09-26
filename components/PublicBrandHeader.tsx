import { ACCENT_BG, type PublicBranding } from "@/lib/brandingUi";

interface PublicBrandHeaderProps {
  orgName: string;
  /** null renders nothing extra — callers on the default (unbranded) path
   * should skip this component entirely rather than pass null, except the
   * full-size org-page hero, which always shows an icon chip + name. */
  branding: PublicBranding | null;
  /** Shown under the name when there's no welcome text. Omit to render no
   * fallback line at all (the compact strip above a question card). */
  fallbackSubtitle?: string;
  /** Compact: smaller chip, no name heading, no accent band — a small
   * branded strip above other page content. */
  compact?: boolean;
}

/**
 * Branding as shown on public pages: an accent band, a logo (or an
 * initial-letter chip in the org's accent color when there's no logo), and
 * the welcome text. Shared by the org landing page (full size) and the
 * question response page (compact strip above the question card). Used only
 * when `getEffectiveBranding` returned non-null for the org's current plan —
 * everything here is presentational, no plan/feature gating happens here.
 */
export default function PublicBrandHeader({
  orgName,
  branding,
  fallbackSubtitle,
  compact = false,
}: PublicBrandHeaderProps) {
  const accentClass = branding ? ACCENT_BG[branding.accent] : "bg-brand-yellow";
  const chipDims = compact ? "h-9 w-9" : "h-12 w-12";
  const subtitle = branding?.welcomeText || fallbackSubtitle;

  return (
    <div className={compact ? "mb-4 text-center" : "mb-8 text-center"}>
      {branding && (
        <div
          aria-hidden
          className={`mx-auto mb-3 ${compact ? "h-1 w-10" : "h-1.5 w-16"} rounded-full ${accentClass}`}
        />
      )}
      {branding?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API route (app/api/o/[orgSlug]/logo), not a next/image-managed asset
        <img
          src={branding.logoUrl}
          alt={orgName}
          width={compact ? 36 : 48}
          height={compact ? 36 : 48}
          className={`mx-auto mb-4 ${chipDims} rounded-xl border-2 border-ink bg-card object-contain p-1`}
        />
      ) : (
        <span
          className={`mx-auto mb-4 inline-flex ${chipDims} items-center justify-center rounded-xl border-2 border-ink ${accentClass} text-on-brand ${compact ? "text-sm" : "text-xl"} font-black`}
        >
          {orgName.charAt(0).toUpperCase()}
        </span>
      )}
      {!compact && (
        <h1 className="mb-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          {orgName}
        </h1>
      )}
      {subtitle && (
        <p className="whitespace-pre-line text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
