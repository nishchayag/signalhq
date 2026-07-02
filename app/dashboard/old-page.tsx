"use client";
import React, { useCallback, useEffect } from "react";
import { IMessage } from "@/models/message.model";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAcceptingMessagesSchema } from "@/schemas/acceptMessageSchema";
import { Loader2 } from "lucide-react";
import axios from "axios";
import MessageCard from "@/components/MessageCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
type AcceptMessagesFormData = {
  isAcceptingMessages: boolean;
};
const Page = () => {
  const [messages, setMessages] = React.useState<Array<IMessage>>([]);
  const [loading, setLoading] = React.useState(false);
  const [isSwitchLoading, setIsSwitchLoading] = React.useState(false);

  const handleDeleteMessage = async (messageId: string) => {
    setMessages(messages.filter((message) => message._id !== messageId));
  };

  const { data: session } = useSession();

  const { watch, setValue } = useForm<AcceptMessagesFormData>({
    resolver: zodResolver(isAcceptingMessagesSchema),
  });

  const isAcceptMessages = watch("isAcceptingMessages");

  const fetchAcceptMessages = useCallback(async () => {
    setIsSwitchLoading(true);
    try {
      const response = await axios.get("/api/acceptMessages");
      if (response.data.success) {
        setValue("isAcceptingMessages", response.data.isAcceptingMessages);
      }
    } catch (error: unknown) {
      console.error("Error fetching accept messages:", error);
      toast.error(
        "Failed to fetch message acceptance status: " + (error as Error).message
      );
    } finally {
      setIsSwitchLoading(false);
    }
  }, [setValue]);

  const fetchMessages = useCallback(
    async (refresh: boolean = false) => {
      setLoading(true);
      setIsSwitchLoading(false);
      try {
        const response = await axios.get("/api/getMessages");
        if (response.data.success) {
          setMessages(response.data.messages);
        }
        if (refresh) {
          toast("Showing latest messages");
        }
      } catch (error: unknown) {
        console.error("Error fetching messages:", error);
        toast.error("Failed to fetch messages: " + (error as Error).message);
      } finally {
        setIsSwitchLoading(false);
        setLoading(false);
      }
    },
    [setLoading, setMessages]
  );

  useEffect(() => {
    if (!session || !session.user) return;

    fetchMessages();
    fetchAcceptMessages();
  }, [session, setValue, fetchAcceptMessages, fetchMessages]);

  const handleSwitchChange = async (checked: boolean) => {
    setIsSwitchLoading(true);
    try {
      const response = await axios.post("/api/acceptMessages", {
        isAcceptingMessages: checked,
      });

      if (response.data.success) {
        setValue("isAcceptingMessages", checked);
        toast.success("Message acceptance status updated successfully");
      }
    } catch (error: unknown) {
      console.error("Error updating message acceptance status:", error);
      toast.error(
        "Failed to update message acceptance status: " +
          (error as Error).message
      );
    } finally {
      setIsSwitchLoading(false);
    }
  };
  const domainUrl = process.env.NEXT_PUBLIC_DOMAIN;
  console.log(messages);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Top Panel */}
      {/* Share Link Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted px-4 py-3 rounded-lg border">
        <div className="text-sm font-medium text-muted-foreground">
          Your review form link
        </div>
        <div className="flex flex-1 items-center gap-2">
          <input
            readOnly
            placeholder="url"
            value={`https://${domainUrl}/u/${session?.user?.username || session?.user?.email || "your-link"}`}
            className="flex-1 px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(
                `https://${domainUrl}/u/${session?.user?.username || session?.user?.email || "your-link"}`
              );
              toast.success("Link copied to clipboard");
            }}
            className="cursor-pointer"
          >
            Copy
          </Button>
        </div>
      </div>
      {/* <Separator /> */}
      {/* Accepting Messages Toggle and Refresh Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-indigo-600">Your Feedback</h1>

        <div className="flex items-center gap-3">
          {/* Accepting Messages Toggle */}
          <div className="flex items-center gap-2">
            <Label htmlFor="accept-messages" className="text-sm">
              Accepting Messages
            </Label>
            <Switch
              id="accept-messages"
              checked={isAcceptMessages}
              disabled={isSwitchLoading}
              onCheckedChange={handleSwitchChange}
            />
            {isSwitchLoading && (
              <Loader2 className="animate-spin h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMessages(true)}
            disabled={loading}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="text-sm">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Message Cards */}
      {loading ? (
        <div className="flex justify-center mt-12 text-gray-500">
          Loading messages...
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center text-gray-500 mt-20 text-lg">
          You haven&apos;t received any messages yet.
        </div>
      ) : (
        <div className="space-y-6 grid grid-cols-3 gap-6">
          {messages.map((message) => (
            <MessageCard
              key={message._id as string}
              message={message}
              onMessageDelete={handleDeleteMessage}
              canReply={false}
              onReplySaved={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Page;
