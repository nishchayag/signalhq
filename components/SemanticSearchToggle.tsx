"use client";
import { Sparkles } from "lucide-react";
import AiQuotaNote from "@/components/AiQuotaNote";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";

interface SemanticSearchToggleProps {
  ai: AiStatus | null;
  on: boolean;
  onChange: (on: boolean) => void;
}

/** True when this viewer may use semantic search in the active org. */
export function semanticSearchOffered(ai: AiStatus | null): boolean {
  return Boolean(ai?.enabled && ai.can.search);
}

/**
 * "Semantic" pill beside a dashboard search input: when on, searches match
 * by meaning (lib/semanticSearch.ts) instead of by substring. Hidden unless
 * AI is enabled and the role may search.
 */
export default function SemanticSearchToggle({ ai, on, onChange }: SemanticSearchToggleProps) {
  if (!semanticSearchOffered(ai)) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title="Search by meaning instead of exact words"
      className={`pop inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink px-3 text-sm font-bold ${
        on ? "bg-brand-yellow text-on-brand" : "bg-card text-foreground"
      }`}
    >
      <Sparkles className="h-4 w-4" strokeWidth={2.5} />
      Semantic
    </button>
  );
}

/** Notes under a semantic result list: quota exhausted, or candidate cap hit. */
export function SemanticSearchNotes({
  ai,
  active,
  truncated,
}: {
  ai: AiStatus | null;
  active: boolean;
  truncated: boolean;
}) {
  if (!semanticSearchOffered(ai)) return null;
  return (
    <>
      {active && truncated && (
        <p className="text-xs text-muted-foreground">
          Searched your 1,000 most recent messages.
        </p>
      )}
      <AiQuotaNote usage={ai?.usage?.search} resetsAt={ai?.resetsAt} />
    </>
  );
}
