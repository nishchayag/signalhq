import Link from "next/link";

export interface FeatureUsage {
  used: number;
  limit: number | null;
}

/** True when a feature's monthly AI quota has been used up. `null` limit is unlimited. */
export function quotaExhausted(usage?: FeatureUsage | null): boolean {
  if (!usage || usage.limit === null) return false;
  return usage.used >= usage.limit;
}

interface AiQuotaNoteProps {
  usage?: FeatureUsage | null;
  resetsAt?: string | null;
  className?: string;
}

/**
 * Inline note shown next to an AI control once its monthly quota is
 * exhausted: "Monthly AI limit reached (30/30) · resets Oct 1 · Upgrade".
 * Renders nothing while there's quota left (or the limit is unlimited).
 */
export default function AiQuotaNote({ usage, resetsAt, className }: AiQuotaNoteProps) {
  if (!quotaExhausted(usage)) return null;

  const resetLabel = resetsAt
    ? new Date(resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <p
      className={`rounded-lg border-2 border-ink bg-brand-pink px-3 py-2 text-sm font-bold text-on-brand ${className ?? ""}`}
    >
      Monthly AI limit reached ({usage!.used}/{usage!.limit})
      {resetLabel ? ` · resets ${resetLabel}` : ""} ·{" "}
      <Link href="/dashboard/organization" className="underline">
        Upgrade
      </Link>
    </p>
  );
}
