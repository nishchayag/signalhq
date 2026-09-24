"use client";
import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import AiQuotaNote, { quotaExhausted } from "@/components/AiQuotaNote";
import { useConfirm } from "@/components/ConfirmProvider";
import { apiError } from "@/lib/apiError";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";

type Tone = "warm" | "neutral" | "brief";

const TONES: { value: Tone; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "brief", label: "Brief" },
];

interface AiDraftButtonProps {
  messageId: string;
  /** Fill the reply textarea with the generated draft. */
  onDraft: (text: string) => void;
  /** Whatever's currently in the textarea — confirm before overwriting it. */
  currentText: string;
  ai: AiStatus | null;
  refreshAi: () => void;
}

/**
 * "Draft with AI" control for a reply textarea: a tone selector, an optional
 * intent hint, and a button that fills the textarea via `onDraft`. Never
 * sends anything itself — the caller still has to edit and submit. Kept
 * self-contained (no dependency on the surrounding form) so it can move
 * between MessageCard's reply dialog and the member-thread page, and later
 * into the C13/C15 thread rework.
 */
export default function AiDraftButton({
  messageId,
  onDraft,
  currentText,
  ai,
  refreshAi,
}: AiDraftButtonProps) {
  const confirm = useConfirm();
  const [tone, setTone] = useState<Tone>("warm");
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [hasDrafted, setHasDrafted] = useState(false);

  if (!ai?.enabled || !ai.can.draft) return null;
  const draftUsage = ai.usage?.draft;

  const handleDraft = async () => {
    if (currentText.trim()) {
      const ok = await confirm({
        title: "Replace your draft?",
        description: "The AI draft will overwrite what you've already written.",
        confirmLabel: "Replace",
      });
      if (!ok) return;
    }
    setDrafting(true);
    try {
      const res = await axios.post(`/api/messages/${messageId}/draft`, {
        tone,
        intent: intent.trim() || undefined,
      });
      onDraft(res.data.draft);
      setHasDrafted(true);
    } catch (error) {
      toast.error(apiError(error, "Couldn't generate a draft right now"));
    } finally {
      setDrafting(false);
      refreshAi();
    }
  };

  return (
    <div className="space-y-2 rounded-lg border-2 border-dashed border-ink/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TONES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTone(t.value)}
            disabled={drafting}
            className={`rounded-md border-2 border-ink px-2 py-0.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === t.value ? "bg-brand-yellow text-on-brand" : "bg-card text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <input
          type="text"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What to convey (optional)"
          maxLength={300}
          disabled={drafting}
          aria-label="What the reply should convey"
          className="h-7 min-w-0 flex-1 rounded-md border-2 border-ink bg-card px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDraft}
          disabled={drafting || quotaExhausted(draftUsage)}
        >
          {drafting ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3 w-3" />
          )}
          Draft with AI
        </Button>
      </div>
      <AiQuotaNote usage={draftUsage} resetsAt={ai.resetsAt} />
      {hasDrafted && (
        <p className="text-xs font-medium text-muted-foreground">AI draft — edit before sending</p>
      )}
    </div>
  );
}
