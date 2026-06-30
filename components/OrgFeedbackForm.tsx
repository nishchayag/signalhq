"use client";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

type FormData = { content: string };

// Anonymous general-feedback form for an organization's public page.
export default function OrgFeedbackForm({ orgSlug }: { orgSlug: string }) {
  const [submitting, setSubmitting] = useState(false);
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
        reset();
      } else {
        toast.error(res.data.message || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Textarea
        {...register("content")}
        placeholder="Share your anonymous feedback..."
        className="min-h-[120px] resize-none"
        disabled={submitting}
      />
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
