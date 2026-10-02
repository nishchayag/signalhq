import { buildPublicUrl } from "@/lib/publicUrl";

/**
 * "Powered by SignalHQ" badge shown on the embed widget for orgs whose plan
 * doesn't include `embedNoBadge` (lib/plans.ts; FREE only — see
 * getPublicOrg#showBadge). Links out to the marketing site in a new tab so
 * clicking it never navigates the embedding site's iframe away.
 */
export default function EmbedBadge() {
  return (
    <div className="mt-6 flex justify-center pb-6">
      <a
        href={buildPublicUrl("/")}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground shadow-solid-sm transition hover:bg-secondary"
      >
        Powered by <span className="text-foreground">SignalHQ</span>
      </a>
    </div>
  );
}
