"use client";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AiQuotaNote, { quotaExhausted } from "@/components/AiQuotaNote";
import { apiError } from "@/lib/apiError";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";
import type { AiSentiment } from "@/models/message.model";

interface InsightQuote {
  messageId: string;
  text: string;
}

interface InsightTheme {
  label: string;
  sentiment: AiSentiment;
  description: string;
  count: number;
  quotes: InsightQuote[];
}

interface Insight {
  summary: string;
  themes: InsightTheme[];
  actionItems: string[];
  sourceCount: number;
  generatedAt: string;
}

const SENTIMENT_CHIP: Record<AiSentiment, string> = {
  positive: "bg-brand-mint text-on-brand",
  negative: "bg-brand-pink text-on-brand",
  mixed: "bg-brand-yellow text-on-brand",
  neutral: "bg-card text-foreground",
};

interface InsightsPanelProps {
  /** Omit for the org's general messages; pass to scope to one question. */
  questionId?: string;
  ai: AiStatus | null;
  refreshAi: () => void;
}

/**
 * Cached AI summary of a message scope (general feedback, or one question's
 * responses): themes with sentiment + verbatim quotes, and action items.
 * Renders nothing while AI is disabled, or when there's no insight yet and
 * this role can't generate one — see app/api/insights/route.ts for the
 * authorization this mirrors.
 */
export default function InsightsPanel({ questionId, ai, refreshAi }: InsightsPanelProps) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [stale, setStale] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await axios.get("/api/insights", {
        params: questionId ? { questionId } : undefined,
      });
      setInsight(res.data.insight);
      setStale(res.data.stale);
      setCurrentCount(res.data.currentCount);
      setCanGenerate(res.data.canGenerate);
    } catch (error) {
      console.error("Error fetching insight:", error);
      setInsight(null);
      setCanGenerate(false);
    } finally {
      setLoaded(true);
    }
  }, [questionId]);

  useEffect(() => {
    if (ai?.enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    } else {
      setLoaded(true);
    }
  }, [ai?.enabled, load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await axios.post("/api/insights", null, {
        params: questionId ? { questionId } : undefined,
      });
      toast.success(insight ? "Insights refreshed" : "Insights generated");
      await load();
    } catch (error) {
      toast.error(apiError(error, "Couldn't generate insights right now"));
    } finally {
      setGenerating(false);
      refreshAi();
    }
  };

  if (!ai?.enabled || !loaded) return null;
  if (!insight && !canGenerate) return null;

  const insightsUsage = ai.usage?.insights;
  const newSince = insight ? Math.max(0, currentCount - insight.sourceCount) : 0;
  const generateDisabled = generating || quotaExhausted(insightsUsage) || currentCount < 3;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <Sparkles className="h-4 w-4" />
          <CardTitle className="text-base">AI insights</CardTitle>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {canGenerate && (
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generateDisabled}>
            {generating ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3 w-3" />
            )}
            {insight ? "Refresh" : "Generate"}
          </Button>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {canGenerate && <AiQuotaNote usage={insightsUsage} resetsAt={ai.resetsAt} />}
          {!insight ? (
            <p className="text-sm text-muted-foreground">
              {currentCount < 3
                ? "Need at least 3 messages before insights can be generated."
                : "No insights yet."}
            </p>
          ) : (
            <>
              <p className="text-sm text-foreground">{insight.summary}</p>

              <div className="space-y-3">
                {insight.themes.map((theme, i) => {
                  const isExpanded = expanded.has(i);
                  return (
                    <div key={i} className="rounded-lg border-2 border-ink p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{theme.label}</span>
                        <span
                          className={`inline-flex items-center rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide ${SENTIMENT_CHIP[theme.sentiment]}`}
                        >
                          {theme.sentiment}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {theme.count} message{theme.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{theme.description}</p>
                      {theme.quotes.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="text-xs font-bold text-muted-foreground underline underline-offset-2"
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              })
                            }
                          >
                            {isExpanded
                              ? "Hide quotes"
                              : `Show ${theme.quotes.length} quote${theme.quotes.length === 1 ? "" : "s"}`}
                          </button>
                          {isExpanded && (
                            <ul className="mt-2 space-y-1.5">
                              {theme.quotes.map((q) => (
                                <li
                                  key={q.messageId}
                                  className="rounded-md bg-muted px-2 py-1.5 text-xs italic text-foreground"
                                >
                                  &ldquo;{q.text}&rdquo;
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {insight.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Action items
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {insight.actionItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Generated {formatDistanceToNow(new Date(insight.generatedAt), { addSuffix: true })}
              </p>

              {stale && newSince > 0 && canGenerate && (
                <p className="rounded-lg border-2 border-ink bg-brand-blue/20 px-3 py-2 text-sm font-medium text-foreground">
                  {newSince} new response{newSince === 1 ? "" : "s"} since this summary —{" "}
                  <button
                    type="button"
                    className="font-bold underline"
                    onClick={handleGenerate}
                    disabled={generateDisabled}
                  >
                    Refresh
                  </button>
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
