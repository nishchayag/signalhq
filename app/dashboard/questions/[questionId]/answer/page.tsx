"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import { PageLoader } from "@/components/Loader";

// Entry point for a member answering an internal question: resolves their
// own thread if it already exists (redirecting straight to it), or lets
// them write their first answer if it doesn't.
export default function AnswerQuestionPage() {
  const params = useParams<{ questionId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [questionText, setQuestionText] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`/api/questions/${params.questionId}/answer`);
        if (!res.data.success) {
          toast.error(res.data.message || "Failed to load question");
          return;
        }
        if (res.data.thread) {
          router.replace(
            `/dashboard/questions/${params.questionId}/replies/${res.data.thread._id}`
          );
          return;
        }
        setQuestionText(res.data.question.questionText);
      } catch (error) {
        const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
        toast.error(msg || "Failed to load question");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.questionId, router]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`/api/questions/${params.questionId}/answer`, {
        content: content.trim(),
      });
      if (res.data.success) {
        router.replace(
          `/dashboard/questions/${params.questionId}/replies/${res.data.threadId}`
        );
      } else {
        toast.error(res.data.message || "Failed to submit answer");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Answer privately
          </h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>

        <div className="rounded-2xl border-2 border-ink bg-card p-5 shadow-solid-sm mb-6">
          <p className="font-bold text-foreground">{questionText}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your answer creates a private thread only you and the org&apos;s
            owner/admins can see — no other team member will see it.
          </p>
        </div>

        <div className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={enterToSendWith(handleSubmit)}
            placeholder="Write your answer..."
            className="min-h-[120px] resize-none"
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">{enterToSendHint}</p>
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit answer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
