"use client";
import { useState } from "react";
import axios from "axios";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { highlightSegments } from "@/lib/highlightSegments";
import type { GuardCategory, GuardResponse, GuardRisk, GuardTarget } from "@/schemas/aiSchema";

const MIN_LENGTH = 10;

const RISK_CHIP: Record<GuardRisk, string> = {
  low: "bg-brand-mint text-on-brand",
  medium: "bg-brand-yellow text-on-brand",
  high: "bg-brand-pink text-on-brand",
};

const RISK_TITLE: Record<GuardRisk, string> = {
  low: "Looks fairly anonymous",
  medium: "Some details could identify you",
  high: "This could identify you",
};

const CATEGORY_LABEL: Record<GuardCategory, string> = {
  name: "name",
  role: "role",
  team: "team",
  date: "date",
  location: "location",
  contact: "contact",
  event: "event",
  distinctive_phrase: "distinctive phrasing",
  other: "detail",
};

// Derives the coarse analytics label from the target's discriminant key —
// never anything content-shaped. `replyToken` is for C16's follow-up guard.
function targetCategory(target: GuardTarget): "org" | "question" | "reply" {
  if ("orgSlug" in target) return "org";
  if ("questionSlug" in target) return "question";
  return "reply";
}

interface AnonymityGuardProps {
  content: string;
  target: GuardTarget;
  onApplyRewrite: (text: string) => void;
  disabled?: boolean;
  /** Shown in the disclosure copy; falls back to "the organization". */
  orgName?: string;
}

/**
 * "Check for identifying details" control for a public feedback textarea.
 * Runs POST /api/guard only on an explicit click — never on keystroke,
 * blur or submit — and never blocks sending. See the Phase 3 plan's "Guard
 * privacy" decision: the draft is never logged or stored by this component,
 * and the whole thing is masked from Microsoft Clarity.
 */
export default function AnonymityGuard({
  content,
  target,
  onApplyRewrite,
  disabled,
  orgName,
}: AnonymityGuardProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<GuardResponse | null>(null);
  const [checkedContent, setCheckedContent] = useState<string | null>(null);
  const [rewriteDismissed, setRewriteDismissed] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const trimmed = content.trim();
  const stale = result !== null && checkedContent !== null && content !== checkedContent;

  const handleCheck = async () => {
    trackEvent("guard_used", targetCategory(target));
    setChecking(true);
    setInlineMessage(null);
    try {
      const res = await axios.post<GuardResponse>("/api/guard", { content: trimmed, target });
      setResult(res.data);
      setCheckedContent(trimmed);
      setRewriteDismissed(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as { message?: string; code?: string } | undefined;
        const permanentlyUnavailable =
          status === 503 || (status === 429 && data?.code === "AI_QUOTA_EXHAUSTED");
        if (permanentlyUnavailable) {
          setHidden(true);
        }
        setInlineMessage(
          data?.message ??
            (status === 429
              ? "Too many checks from this location. Please try again in a few minutes."
              : "Couldn't run the check right now — you can still send.")
        );
      } else {
        setInlineMessage("Couldn't run the check right now — you can still send.");
      }
    } finally {
      setChecking(false);
    }
  };

  const applyRewrite = () => {
    if (!result?.rewrite) return;
    onApplyRewrite(result.rewrite);
    // The applied text is now what's in the textarea, so it isn't
    // immediately flagged stale — only a further edit will do that.
    setCheckedContent(result.rewrite);
  };

  if (hidden) {
    return inlineMessage ? (
      <p className="mt-2 text-xs font-medium text-muted-foreground" data-clarity-mask="true">
        {inlineMessage}
      </p>
    ) : null;
  }

  return (
    <div data-clarity-mask="true" className="mt-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleCheck}
        disabled={disabled || checking || trimmed.length < MIN_LENGTH}
      >
        {checking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Check for identifying details
      </Button>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Optional: sends your draft to our AI provider (Mistral) to spot details that might
        identify you. Not saved, and not shared with {orgName || "the organization"} unless you
        send it.
      </p>

      {inlineMessage && !result && (
        <p className="mt-2 text-xs font-medium text-muted-foreground">{inlineMessage}</p>
      )}

      <div aria-live="polite">
        {result && (
          <div className="mt-3 rounded-xl border-2 border-ink bg-card p-4 shadow-solid-sm">
            {stale ? (
              <p className="text-sm font-bold text-foreground">Your text changed — check again</p>
            ) : (
              <GuardResult
                result={result}
                content={checkedContent ?? content}
                rewriteDismissed={rewriteDismissed}
                onApplyRewrite={applyRewrite}
                onKeepMine={() => setRewriteDismissed(true)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuardResult({
  result,
  content,
  rewriteDismissed,
  onApplyRewrite,
  onKeepMine,
}: {
  result: GuardResponse;
  content: string;
  rewriteDismissed: boolean;
  onApplyRewrite: () => void;
  onKeepMine: () => void;
}) {
  const segments = highlightSegments(
    content,
    result.issues.map((i) => i.snippet)
  );
  const reassuring = result.risk === "low" && result.issues.length === 0 && !result.partial;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide ${RISK_CHIP[result.risk]}`}
        >
          {result.risk}
        </span>
        <span className="text-sm font-bold text-foreground">{RISK_TITLE[result.risk]}</span>
      </div>

      {segments.length > 0 && (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {segments.map((segment, i) =>
            segment.highlighted ? (
              <mark
                key={i}
                className="rounded-sm border border-ink bg-brand-yellow px-0.5 text-on-brand"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          )}
        </p>
      )}

      {result.issues.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {result.issues.map((issue, i) => (
            <li key={i}>
              &ldquo;{issue.snippet}&rdquo; — {CATEGORY_LABEL[issue.category]}: {issue.why}
            </li>
          ))}
        </ul>
      )}

      {result.partial && (
        <p className="text-sm text-muted-foreground">Detailed check unavailable right now.</p>
      )}

      {reassuring && (
        <p className="text-sm text-muted-foreground">
          Nothing here looks likely to identify you.
        </p>
      )}

      {result.rewrite && !rewriteDismissed && (
        <div className="space-y-2 rounded-lg border-2 border-dashed border-ink/40 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Suggested rewrite
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{result.rewrite}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onApplyRewrite}>
              Use suggested rewrite
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onKeepMine}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
