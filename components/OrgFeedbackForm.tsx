"use client";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import ReplyReceiptCard from "@/components/ReplyReceiptCard";
import { enterToSend, enterToSendHint } from "@/lib/enterToSend";

type FormData = { content: string };

// Anonymous general-feedback form for an organization's public page.
export default function OrgFeedbackForm({ orgSlug }: { orgSlug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [replyToken, setReplyToken] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<FormData>({
    defaultValues: { content: "" },
  });

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
        />
        <p className="text-xs text-muted-foreground mt-1">{enterToSendHint}</p>
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
