"use client";
import { Check, Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalFlag } from "./useLocalFlag";
import type { DashboardData } from "./useDashboardData";

/** Per-org onboarding flags, shared with the link card's Copy button. */
export function useOnboardingFlags(orgId: string | undefined) {
  const [copied, markCopied] = useLocalFlag(orgId ? `signalhq:onboarding:copied:${orgId}` : null);
  const [dismissed, dismiss] = useLocalFlag(orgId ? `signalhq:onboarding:dismissed:${orgId}` : null);
  return { copied, markCopied, dismissed, dismiss };
}

/**
 * "Get started" card for a new org: share the link, ask a question, get a
 * response. Progress comes from real data where it exists (questions,
 * responses — judged on unfiltered data so typing in search can't make it
 * reappear) and localStorage for the one step the server can't see (copying
 * the link). Disappears once everything's done or it's dismissed.
 */
export default function OnboardingChecklist({
  d,
  onCopyLink,
}: {
  d: DashboardData;
  onCopyLink: () => void;
}) {
  const { copied, dismissed, dismiss } = useOnboardingFlags(d.orgId);
  const steps = [
    { done: copied, label: "Copy your feedback link and share it with your team" },
    { done: d.questions.length > 0, label: "Create your first question" },
    { done: d.hasAnyResponse, label: "Get your first anonymous response" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  return (
    <section
      aria-label="Get started"
      className="relative mb-6 rounded-2xl border-2 border-ink bg-brand-yellow/40 p-5 shadow-solid-sm"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss getting started"
        className="absolute right-3 top-3 rounded-md border-2 border-transparent p-0.5 text-foreground/70 hover:border-ink hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Get started · {doneCount}/{steps.length}
      </p>
      <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">Start hearing the real feedback</h3>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink text-xs font-black ${
                step.done ? "bg-brand-mint text-ink" : "bg-card text-foreground"
              }`}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        {!copied && (
          <Button size="sm" variant="outline" onClick={onCopyLink}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy link
          </Button>
        )}
        {d.questions.length === 0 && (
          <Button size="sm" onClick={() => d.setShowCreateDialog(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create a question
          </Button>
        )}
      </div>
    </section>
  );
}
