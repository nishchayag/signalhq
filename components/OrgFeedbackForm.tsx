"use client";
import React, { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import ReplyReceiptCard from "@/components/ReplyReceiptCard";
import AnonymityGuard from "@/components/AnonymityGuard";
import { enterToSend, enterToSendHint } from "@/lib/enterToSend";

type FormData = { content: string };

// Anonymous general-feedback form for an organization's public page.
// `guardAvailable` (from the page) says whether to offer the AI anonymity
// check (POST /api/guard) — AI configured and the org has guard quota left.
export default function OrgFeedbackForm({
  orgSlug,
  guardAvailable,
  orgName,
}: {
  orgSlug: string;
  guardAvailable?: boolean;
  orgName?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [replyToken, setReplyToken] = useState<string | null>(null);
  const { register, handleSubmit, reset, control, setValue } = useForm<FormData>({
    defaultValues: { content: "" },
  });
  const content = useWatch({ control, name: "content" });

  const onSubmit = async (data: FormData) => {
    if (!data.content.trim()) {
      toast.error("Please write a message first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`/api/o/${orgSlug}/sendMessage`, {
        content: data.content,
      });
      if (res.data.success) {
        toast.success("Message sent successfully");
        trackEvent("feedback_sent", "org");
        reset();
        setReplyToken(res.data.replyToken);
      } else {
        toast.error(res.data.message || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      toast.error(msg || "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  };

  if (replyToken) {
    return (
      <div className="space-y-4">
        <ReplyReceiptCard replyToken={replyToken} />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setReplyToken(null)}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Textarea
          {...register("content")}
          onKeyDown={enterToSend}
          placeholder="Share your anonymous feedback..."
          className="min-h-[120px] resize-none"
          disabled={submitting}
          data-clarity-mask="true"
        />
        <p className="text-xs text-muted-foreground mt-1">{enterToSendHint}</p>
        {guardAvailable && (
          <AnonymityGuard
            content={content ?? ""}
            target={{ orgSlug }}
            onApplyRewrite={(text) =>
              setValue("content", text, { shouldValidate: true, shouldDirty: true })
            }
            disabled={submitting}
            orgName={orgName}
          />
        )}
      </div>
      <Button type="submit" disabled={submitting} className="w-full" size="lg">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Send Anonymous Feedback
          </>
        )}
      </Button>
    </form>
  );
}
