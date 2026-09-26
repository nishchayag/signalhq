"use client";
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import axios from "axios";
import { Loader2, Lock, Send } from "lucide-react";
import ReplyReceiptCard from "@/components/ReplyReceiptCard";
import AnonymityGuard from "@/components/AnonymityGuard";
import AnswerFields from "@/components/AnswerFields";
import PublicBrandHeader from "@/components/PublicBrandHeader";
import { enterToSendHint } from "@/lib/enterToSend";
import type { PublicBranding } from "@/lib/brandingUi";
import {
  buildAnswerBody,
  canSubmitAnswer,
  closedMessage,
  emptyAnswerValues,
  type AnswerFormValues,
} from "@/lib/answerForm";
import type { ClosedReason, PublicQuestionConfig } from "@/lib/answers";

interface QuestionData {
  questionText: string;
  description?: string;
  slug: string;
  username: string;
  /** Offer the AI anonymity check (POST /api/guard)? AI on + org has guard quota. */
  guardAvailable?: boolean;
  config: PublicQuestionConfig;
  closesAt: string | null;
  closed: { reason: ClosedReason } | null;
}

/**
 * Anonymous question-response form, keyed by the question's global slug.
 * Rendered from the org-scoped route (/o/[orgSlug]/q/[slug]); the legacy
 * /q/[slug] route is a pure server redirect and never mounts this. Renders
 * the type-specific fields via AnswerFields.
 *
 * `orgName`/`branding` are optional — the page passes them from
 * lib/publicLookups.ts#getPublicOrg. `branding` is null unless the org's
 * plan currently allows it (lib/branding.ts#getEffectiveBranding), in which
 * case a compact branded strip renders above the "Anonymous Feedback"
 * heading; omitted entirely otherwise, so the page looks exactly as before.
 */
export default function QuestionResponseForm({
  slug,
  orgName,
  branding,
}: {
  slug: string;
  orgName?: string;
  branding?: PublicBranding | null;
}) {
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyToken, setReplyToken] = useState<string | null>(null);
  const [values, setValues] = useState<AnswerFormValues>(emptyAnswerValues());
  // A question can close between the GET and the POST (a cap reached by
  // someone else, or the close date ticking over); the 410 response doesn't
  // carry the reason, so this renders the generic closed message.
  const [raceClosed, setRaceClosed] = useState(false);

  useEffect(() => {
    const fetchQuestion = async () => {
      try {
        const response = await axios.get(`/api/questions/submit/${slug}`);
        if (response.data.success) {
          setQuestion(response.data.question);
        } else {
          toast.error("Question not found");
        }
      } catch (error) {
        console.error("Error fetching question:", error);
        toast.error("Failed to load question");
      } finally {
        setLoading(false);
      }
    };
    fetchQuestion();
  }, [slug]);

  const handleSend = async () => {
    if (!question || submitting || !canSubmitAnswer(question.config, values)) return;
    setSubmitting(true);
    try {
      const body = buildAnswerBody(question.config, values);
      const response = await axios.post(`/api/questions/submit/${slug}`, body);
      if (response.data.success) {
        toast.success("Response submitted successfully!");
        trackEvent("feedback_sent", "question");
        setValues(emptyAnswerValues());
        setReplyToken(response.data.replyToken);
      } else {
        toast.error(response.data.message || "Failed to submit response");
      }
    } catch (error) {
      const data = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string; message?: string } | undefined)
        : undefined;
      if (data?.code === "QUESTION_CLOSED") {
        setRaceClosed(true);
      } else {
        toast.error(data?.message || "Failed to submit response");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Question Not Found</h2>
              <p className="text-muted-foreground">
                This question may have been removed or is no longer active.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (replyToken) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-dot-grid px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-ink bg-brand-mint rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-on-brand"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-black mb-2">Response Submitted!</h2>
              <p className="text-muted-foreground mb-4">
                Your anonymous response has been sent.
              </p>
            </div>
            <ReplyReceiptCard replyToken={replyToken} />
            <Button
              onClick={() => setReplyToken(null)}
              variant="outline"
              className="w-full"
            >
              Submit Another Response
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (question.closed || raceClosed) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-dot-grid px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-black text-foreground">This question is closed</h2>
            <p className="text-muted-foreground">{closedMessage(question.closed?.reason)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-dot-grid py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {branding && orgName && (
          <PublicBrandHeader orgName={orgName} branding={branding} compact />
        )}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">
            Anonymous Feedback
          </h1>
          <p className="text-muted-foreground">
            Your response will be completely anonymous
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center font-black">
              {question.questionText}
            </CardTitle>
            {question.description && (
              <p className="text-muted-foreground text-center mt-2">
                {question.description}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="space-y-4"
            >
              <div>
                <AnswerFields
                  config={question.config}
                  values={values}
                  onChange={setValues}
                  disabled={submitting}
                  onEnterSend={handleSend}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {enterToSendHint}
                </p>
                {question.guardAvailable && values.content.trim() && (
                  <AnonymityGuard
                    content={values.content}
                    target={{ questionSlug: question.slug }}
                    onApplyRewrite={(text) =>
                      setValues((v) => ({ ...v, content: text }))
                    }
                    disabled={submitting}
                  />
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || !canSubmitAnswer(question.config, values)}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Anonymous Response
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-brand-blue/25 border-2 border-ink rounded-lg">
              <h3 className="font-bold text-foreground mb-2">
                🔒 Your Privacy is Protected
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Your identity remains completely anonymous</li>
                <li>• No personal information is collected or stored</li>
                <li>• Your response cannot be traced back to you</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
