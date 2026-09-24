"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import { PageLoader } from "@/components/Loader";
import AiDraftButton from "@/components/AiDraftButton";
import ThreadView, { type ThreadViewTurn } from "@/components/ThreadView";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";

interface ThreadMessage {
  awaitingOrg?: boolean;
}

// Owner/admin thread view for an anonymous message (the sender's side lives
// at /r/[replyToken] — no session, no account). Only OWNER/ADMIN can reach
// this: the reply GET route 404s for anyone else so existence isn't leaked.
export default function MessageThreadPage() {
  const params = useParams<{ messageId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [message, setMessage] = useState<ThreadMessage | null>(null);
  const [turns, setTurns] = useState<ThreadViewTurn[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);

  const fetchAi = useCallback(async () => {
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/ai`);
      setAi(res.data as AiStatus);
    } catch (error) {
      console.error("Error fetching AI status:", error);
      setAi({
        enabled: false,
        can: { suggest: false, insights: false, draft: false, viewSafety: false, search: false },
      });
    }
  }, [session?.user?.activeOrgId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/messages/${params.messageId}/reply`);
      if (res.data.success) {
        setMessage(res.data.message);
        setTurns(res.data.turns);
        setNotFoundState(false);
      } else {
        setNotFoundState(true);
      }
    } catch {
      setNotFoundState(true);
    } finally {
      setLoading(false);
    }
  }, [params.messageId]);

  useEffect(() => {
    // Standard fetch-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAi();
  }, [fetchAi]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await axios.post(`/api/messages/${params.messageId}/reply`, {
        content: reply.trim(),
      });
      if (res.data.success) {
        setReply("");
        await load();
      } else {
        toast.error(res.data.message || "Failed to send reply");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (notFoundState || !message) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">
          This thread doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Thread</h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {message.awaitingOrg && (
          <span className="mb-4 inline-flex items-center gap-1 rounded-md border-2 border-ink bg-brand-yellow px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide text-on-brand">
            Awaiting your reply
          </span>
        )}

        <ThreadView turns={turns} viewerRole="org" />

        <div className="mt-6 space-y-3">
          <AiDraftButton
            messageId={params.messageId}
            currentText={reply}
            onDraft={setReply}
            ai={ai}
            refreshAi={fetchAi}
          />
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={enterToSendWith(handleSend)}
            placeholder="Write a reply the sender will see via their link..."
            className="min-h-[100px] resize-none"
            disabled={sending}
          />
          <p className="text-xs text-muted-foreground">{enterToSendHint}</p>
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
