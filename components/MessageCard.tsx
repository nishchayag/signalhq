"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSend } from "@/lib/enterToSend";
import { X, Reply as ReplyIcon, Loader2, ShieldAlert, EyeOff } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  questionResponseSchema,
  QuestionResponseRequest,
} from "@/schemas/questionSchema";
import type { MessageView, MessageAiView } from "@/lib/messageView";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import AiDraftButton from "@/components/AiDraftButton";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";

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
  onReplySaved: (
    messageId: string,
    reply: { content: string; repliedAt: string }
  ) => void;
  /** AI status for the active org — undefined/null hides the draft control. */
  ai?: AiStatus | null;
  refreshAi?: () => void;
};

const MessageCard = ({
  message,
  onMessageDelete,
  canReply,
  canDelete,
  onReplySaved,
  ai,
  refreshAi,
}: MessageCardProps) => {
  const confirm = useConfirm();
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const flagged = (message.ai?.toxicity ?? 0) >= TOXICITY_COLLAPSE;
  const [revealed, setRevealed] = React.useState(false);
  const collapsed = flagged && !revealed;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    control,
  } = useForm<QuestionResponseRequest>({
    resolver: zodResolver(questionResponseSchema),
    defaultValues: { content: message.reply?.content ?? "" },
  });
  const draftText = useWatch({ control, name: "content" });

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

  const openReplyDialog = () => {
    reset({ content: message.reply?.content ?? "" });
    setReplyOpen(true);
  };

  const onSubmitReply = async (data: QuestionResponseRequest) => {
    setReplying(true);
    try {
      const response = await axios.post(
        `/api/messages/${message._id}/reply`,
        data
      );
      if (response.data.success) {
        toast.success("Reply saved");
        onReplySaved(message._id as string, response.data.reply);
        setReplyOpen(false);
      } else {
        toast.error(response.data.message || "Failed to save reply");
      }
    } catch (error) {
      console.error("Error saving reply:", error);
      toast.error("Failed to save reply");
    } finally {
      setReplying(false);
    }
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

        {message.reply && (
          <div className="rounded-lg border-2 border-ink bg-brand-mint/25 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ReplyIcon className="h-3.5 w-3.5" />
                Your reply
              </p>
              {canReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={openReplyDialog}
                >
                  Edit
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm text-foreground whitespace-pre-line">
              {message.reply.content}
            </p>
          </div>
        )}

        {!message.reply && canReply && (
          <Button variant="outline" size="sm" onClick={openReplyDialog}>
            <ReplyIcon className="h-4 w-4" />
            Reply
          </Button>
        )}
      </CardContent>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {message.reply ? "Edit reply" : "Reply to this message"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitReply)} className="space-y-4">
            {ai && (
              <AiDraftButton
                messageId={message._id as string}
                currentText={draftText ?? ""}
                onDraft={(text) => setValue("content", text, { shouldValidate: true })}
                ai={ai}
                refreshAi={refreshAi ?? (() => {})}
              />
            )}
            <div className="space-y-2">
              <Textarea
                {...register("content")}
                onKeyDown={enterToSend}
                placeholder="Write a reply the sender will see via their link..."
                className="min-h-[100px] resize-none"
                disabled={replying}
              />
              {errors.content && (
                <p className="text-sm text-destructive">
                  {errors.content.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReplyOpen(false)}
                disabled={replying}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={replying}>
                {replying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save reply"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MessageCard;
