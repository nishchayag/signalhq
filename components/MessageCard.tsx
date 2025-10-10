"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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
import { IMessage } from "@/models/message.model";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";

type MessageCardProps = {
  message: IMessage;
  onMessageDelete: (messageId: string) => void;
};

const MessageCard = ({ message, onMessageDelete }: MessageCardProps) => {
  const [loading, setLoading] = React.useState(false);

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

      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {`${time}, ${date} (${timezone})\n${formatDistanceToNow(createdAt, {
            addSuffix: true,
          })}`}
        </p>
      </CardContent>
    </Card>
  );
};

export default MessageCard;
