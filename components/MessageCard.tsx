"use client";
import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Reply as ReplyIcon, ShieldAlert, EyeOff } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { MessageView, MessageAiView } from "@/lib/messageView";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { lastTurn, type ThreadSource } from "@/lib/thread";

// Messages at or above this toxicity render collapsed. Only OWNER/ADMIN
// responses carry `toxicity`/`piiFlag` (lib/messageView.ts), so MEMBERs never
// see these treatments.
const TOXICITY_COLLAPSE = 0.85;

const SENTIMENT_CHIP: Record<NonNullable<MessageAiView["sentiment"]>, string> = {
  positive: "bg-brand-mint text-on-brand",
  negative: "bg-brand-pink text-on-brand",
  mixed: "bg-brand-yellow text-on-brand",
  neutral: "bg-card text-foreground",
};

const chip =
  "inline-flex items-center gap-1 rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide";

function AiChips({ ai }: { ai: MessageAiView }) {
  if (!ai.sentiment && !ai.tags?.length && !ai.piiFlag) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ai.sentiment && (
        <span className={`${chip} ${SENTIMENT_CHIP[ai.sentiment]}`}>{ai.sentiment}</span>
      )}
      {ai.tags?.map((tag) => (
        <span key={tag} className={`${chip} bg-card text-muted-foreground`}>
          {tag.replace(/-/g, " ")}
        </span>
      ))}
      {ai.piiFlag && (
        <span
          className={`${chip} bg-brand-yellow text-on-brand`}
          title="May contain personal details (names, contact info) — review before sharing"
        >
          <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
          Possible PII
        </span>
      )}
    </div>
  );
}

type MessageCardProps = {
  message: MessageView;
  onMessageDelete: (messageId: string) => void;
  canReply: boolean;
  canDelete: boolean;
};

const MessageCard = ({ message, onMessageDelete, canReply, canDelete }: MessageCardProps) => {
  const confirm = useConfirm();
  const flagged = (message.ai?.toxicity ?? 0) >= TOXICITY_COLLAPSE;
  const [revealed, setRevealed] = React.useState(false);
  const collapsed = flagged && !revealed;
  // Newest turn overall (org reply or the sender's own follow-up), for the
  // card preview. Full history lives at /dashboard/messages/[id].
  const latest = lastTurn(message as unknown as ThreadSource);
  const awaitingOrg = Boolean((message as { awaitingOrg?: boolean }).awaitingOrg);

  // Runs inside the shared confirm dialog, which stays open with a spinner
  // until the delete settles and shows the server's reason if it fails.
  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this message?",
      description: "It's permanently removed, along with any reply. This can't be undone.",
      confirmLabel: "Delete message",
      destructive: true,
      action: () => axios.post(`/api/deleteMessage`, { messageId: message._id }),
    });
    if (!ok) return;
    toast.success("Message deleted");
    onMessageDelete(message._id as string);
  };

  const createdAt = new Date(message.createdAt);

  // Format time
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(createdAt);

  // Format date
  const date = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(createdAt);

  // Extract timezone abbreviation (e.g. IST)
  const timezone =
    new Intl.DateTimeFormat(undefined, {
      timeZoneName: "shortGeneric",
    })
      .formatToParts(createdAt)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-start">
        <div className="overflow-auto">
          {collapsed ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-ink/50 px-3 py-2">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Flagged as potentially abusive
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRevealed(true)}
              >
                Show
              </Button>
            </div>
          ) : (
            <CardTitle className="text-base font-medium">
              {message.content}
            </CardTitle>
          )}
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete message"
            className="text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {message.ai && <AiChips ai={message.ai} />}

        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {`${time}, ${date} (${timezone})\n${formatDistanceToNow(createdAt, {
            addSuffix: true,
          })}`}
        </p>

        {awaitingOrg && (
          <span className={`${chip} bg-brand-yellow text-on-brand`}>Awaiting your reply</span>
        )}

        {latest && (
          <div className="rounded-lg border-2 border-ink bg-card p-3">
            <p className="text-sm text-foreground line-clamp-2 whitespace-pre-line">
              <span className="font-bold">
                {latest.authorRole === "org" ? "You replied" : "They replied"}:
              </span>{" "}
              {latest.content}
            </p>
          </div>
        )}

        {canReply && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/messages/${message._id}`}>
              <ReplyIcon className="h-4 w-4" />
              Open thread
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default MessageCard;
