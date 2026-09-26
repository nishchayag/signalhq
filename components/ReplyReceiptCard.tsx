"use client";
import React from "react";
import { toast } from "sonner";
import { Copy, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPublicUrl } from "@/lib/publicUrl";

// Shown right after an anonymous submission succeeds. The replyToken is the
// sender's only way to check for a reply later — no account, no email.
export default function ReplyReceiptCard({
  replyToken,
}: {
  replyToken: string;
}) {
  const link = buildPublicUrl(`/r/${replyToken}`);

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="rounded-xl border-2 border-ink bg-brand-yellow/25 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <BookmarkCheck className="h-4 w-4" />
        Save this link to check for a reply
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        This is the only way to see a reply — we don&apos;t collect your
        email or tie this to any account. You can reply from this link too,
        once there&apos;s something to reply to.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border-2 border-ink bg-card px-3 py-2 text-sm text-foreground">
          {link}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copyLink}>
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      </div>
    </div>
  );
}
