"use client";
import { useState } from "react";
import axios from "axios";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import AnonymityGuard from "@/components/AnonymityGuard";
import ThreadView, { type ThreadViewTurn } from "@/components/ThreadView";

interface SenderFollowUpFormProps {
  replyToken: string;
  initialTurns: ThreadViewTurn[];
  /** Offer the AI anonymity check (POST /api/guard) on the follow-up draft? */
  guardAvailable?: boolean;
}

/**
 * The whole interactive part of the sender's /r/[replyToken] receipt page:
 * the thread so far (via ThreadView) plus the box to send a follow-up. No
 * account/session — the token in the URL is the only credential. Posts to
 * POST /api/r/[replyToken] and updates the thread from the response, so the
 * page never needs a full reload.
 */
export default function SenderFollowUpForm({
  replyToken,
  initialTurns,
  guardAvailable,
}: SenderFollowUpFormProps) {
  const [turns, setTurns] = useState<ThreadViewTurn[]>(initialTurns);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const hasReply = turns.some((t) => t.authorRole === "org");

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSending(true);
    setInlineMessage(null);
    try {
      const res = await axios.post(`/api/r/${replyToken}`, { content: trimmed });
      setTurns(res.data.turns);
      setContent("");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = (error.response?.data as { message?: string } | undefined)?.message;
        setInlineMessage(
          message ??
            (status === 429
              ? "Too many follow-ups. Please try again later."
              : "Couldn't send your follow-up right now.")
        );
      } else {
        setInlineMessage("Couldn't send your follow-up right now.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <ThreadView turns={turns} viewerRole="sender" roleLabels={{ org: "They replied" }} />

      {!hasReply && (
        <div className="rounded-2xl border-2 border-dashed border-ink/40 py-10 text-center">
          <p className="text-sm font-bold text-foreground">No reply yet</p>
          <p className="text-sm text-muted-foreground">
            Check back later — bookmark this page.
          </p>
        </div>
      )}

      <div className="rounded-2xl border-2 border-ink bg-card p-4 shadow-solid-sm space-y-3">
        <p className="text-sm font-bold text-foreground">Send a follow-up</p>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={enterToSendWith(handleSend)}
          placeholder="Add more detail, or ask a question..."
          className="min-h-[100px] resize-none"
          disabled={sending}
          data-clarity-mask="true"
        />
        <p className="text-xs text-muted-foreground">{enterToSendHint}</p>

        {guardAvailable && (
          <AnonymityGuard
            content={content}
            target={{ replyToken }}
            onApplyRewrite={setContent}
            disabled={sending}
          />
        )}

        <p className="text-xs text-muted-foreground">
          Replies stay anonymous — no account or email is tied to this link.
        </p>

        {inlineMessage && (
          <p className="text-sm font-medium text-destructive" role="alert" data-clarity-mask="true">
            {inlineMessage}
          </p>
        )}

        <Button onClick={handleSend} disabled={sending || !content.trim()}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send follow-up
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
