"use client";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  questionResponseSchema,
  QuestionResponseRequest,
} from "@/schemas/questionSchema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import axios from "axios";
import { Loader2, Send } from "lucide-react";
import ReplyReceiptCard from "@/components/ReplyReceiptCard";
import { enterToSend, enterToSendHint } from "@/lib/enterToSend";

interface QuestionData {
  questionText: string;
  description?: string;
  slug: string;
  username: string;
}

/**
 * Anonymous question-response form, keyed by the question's global slug.
 * Shared by the org-scoped route (/o/[orgSlug]/q/[slug]) and the legacy
 * fallback (/q/[slug]).
 */
export default function QuestionResponseForm({ slug }: { slug: string }) {
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyToken, setReplyToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<QuestionResponseRequest>({
    resolver: zodResolver(questionResponseSchema),
  });

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

  const onSubmit = async (data: QuestionResponseRequest) => {
    setSubmitting(true);
    try {
      const response = await axios.post(`/api/questions/submit/${slug}`, data);
      if (response.data.success) {
        toast.success("Response submitted successfully!");
        trackEvent("feedback_sent", "question");
        reset();
        setReplyToken(response.data.replyToken);
      } else {
        toast.error(response.data.message || "Failed to submit response");
      }
    } catch (error) {
      console.error("Error submitting response:", error);
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      toast.error(msg || "Failed to submit response");
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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-dot-grid py-12 px-4">
      <div className="max-w-2xl mx-auto">
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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Textarea
                  {...register("content")}
                  onKeyDown={enterToSend}
                  placeholder="Type your anonymous response here..."
                  className="min-h-[120px] resize-none"
                  disabled={submitting}
                />
                {errors.content && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.content.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {enterToSendHint}
                </p>
              </div>

              <Button
                type="submit"
                disabled={submitting}
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
