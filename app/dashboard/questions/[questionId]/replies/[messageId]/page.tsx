"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import { PageLoader } from "@/components/Loader";
import AiDraftButton from "@/components/AiDraftButton";
import ThreadView, { type ThreadViewTurn } from "@/components/ThreadView";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";

interface ThreadMessage {
  _id: string;
  content: string;
  createdAt: string;
  questionId: string;
  authorUserId: string;
}

export default function ThreadPage() {
  const params = useParams<{ questionId: string; messageId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ThreadMessage | null>(null);
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
        setThread(res.data.message);
        setTurns(res.data.turns);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAi();
  }, [fetchAi]);

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
    return <PageLoader />;
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

  // `turns` comes straight from the API's lib/thread.ts#threadOf (state, set
  // in `load`), so a typed answer's chip renders the same way it does
  // everywhere else. Org turns always show "Org reply" here — only the member's own turns
  // switch to "You" when they're viewing their own thread; an oversight
  // admin's own reply isn't singled out as "You" either.
  const viewerRole = isThreadOwner ? "member" : undefined;

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

        <ThreadView turns={turns} viewerRole={viewerRole} />

        <div className="mt-6 space-y-3">
          {!isThreadOwner && (
            <AiDraftButton
              messageId={params.messageId}
              currentText={reply}
              onDraft={setReply}
              ai={ai}
              refreshAi={fetchAi}
            />
          )}
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={enterToSendWith(handleSend)}
            placeholder={
              isThreadOwner ? "Add a follow-up..." : "Reply to this member..."
            }
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
