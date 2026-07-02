"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Send, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ThreadEntry {
  _id?: string;
  authorRole: "member" | "org";
  content: string;
  createdAt: string;
}

interface ThreadMessage {
  _id: string;
  content: string;
  createdAt: string;
  questionId: string;
  authorUserId: string;
  replies: ThreadEntry[];
}

export default function ThreadPage() {
  const params = useParams<{ questionId: string; messageId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ThreadMessage | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/messages/${params.messageId}/reply`);
      if (res.data.success) {
        setThread(res.data.message);
      } else {
        toast.error(res.data.message || "Failed to load thread");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to load thread");
    } finally {
      setLoading(false);
    }
  }, [params.messageId]);

  useEffect(() => {
    // Standard fetch-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isThreadOwner =
    !!thread && !!session?.user?._id && thread.authorUserId === session.user._id;

  const handleSend = async () => {
    if (!thread || !reply.trim()) return;
    setSending(true);
    try {
      const url = isThreadOwner
        ? `/api/questions/${params.questionId}/answer`
        : `/api/messages/${params.messageId}/reply`;
      const res = await axios.post(url, { content: reply.trim() });
      if (res.data.success) {
        setReply("");
        await load();
      } else {
        toast.error(res.data.message || "Failed to send");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 text-center">
        <p className="text-muted-foreground">
          This thread doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const turns: ThreadEntry[] = [
    { authorRole: "member", content: thread.content, createdAt: thread.createdAt },
    ...thread.replies,
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Thread
          </h1>
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                isThreadOwner
                  ? "/dashboard"
                  : `/dashboard/questions/${params.questionId}/replies`
              )
            }
          >
            Back
          </Button>
        </div>

        <div className="space-y-3">
          {turns.map((turn, i) => (
            <div
              key={turn._id || i}
              className={`rounded-2xl border-2 border-ink p-4 shadow-solid-sm ${
                turn.authorRole === "org" ? "bg-brand-mint/25" : "bg-brand-blue/20"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {turn.authorRole === "org" ? (
                  <>
                    <Building2 className="h-3.5 w-3.5" />
                    Org reply
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5" />
                    {isThreadOwner ? "You" : "Member"}
                  </>
                )}
                <span className="font-normal normal-case">
                  · {formatDistanceToNow(new Date(turn.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {turn.content}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={
              isThreadOwner ? "Add a follow-up..." : "Reply to this member..."
            }
            className="min-h-[100px] resize-none"
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || !reply.trim()}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
