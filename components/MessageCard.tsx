"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSend } from "@/lib/enterToSend";
import { X, Reply as ReplyIcon, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  questionResponseSchema,
  QuestionResponseRequest,
} from "@/schemas/questionSchema";
import { IMessage } from "@/models/message.model";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";

type MessageCardProps = {
  message: IMessage;
  onMessageDelete: (messageId: string) => void;
  canReply: boolean;
  onReplySaved: (
    messageId: string,
    reply: { content: string; repliedAt: string }
  ) => void;
};

const MessageCard = ({
  message,
  onMessageDelete,
  canReply,
  onReplySaved,
}: MessageCardProps) => {
  const [loading, setLoading] = React.useState(false);
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replying, setReplying] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<QuestionResponseRequest>({
    resolver: zodResolver(questionResponseSchema),
    defaultValues: { content: message.reply?.content ?? "" },
  });

  const handleDeleteConfirm = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`/api/deleteMessage`, {
        messageId: message._id,
      });
      toast.success(response.data.message || "Message deleted");
      onMessageDelete(message._id as string);
    } catch (error: unknown) {
      console.log("Error deleting message:", error);
      toast.error("Failed to delete message:");
    } finally {
      setLoading(false);
    }
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
          <CardTitle className="text-base font-medium">
            {message.content}
          </CardTitle>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 "
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the message.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={loading}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>

      <CardContent className="space-y-4">
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
