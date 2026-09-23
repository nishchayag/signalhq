import { notFound } from "next/navigation";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MessageSquare, Reply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";
import { generateMetadata as createMetadata } from "@/lib/metadata";

// The token in this URL is the sender's only credential: never index it, and
// never leak it to other sites through the Referer header.
export const metadata: Metadata = {
  ...createMetadata({ title: "Your feedback receipt", noindex: true, nofollow: true }),
  referrer: "no-referrer",
};

interface PageProps {
  params: Promise<{ replyToken: string }>;
}

// Public "receipt" page for an anonymous sender to check for a reply, without
// any account/session — the replyToken itself is the only credential.
export default async function ReplyReceiptPage({ params }: PageProps) {
  const { replyToken } = await params;
  await connectDB();

  const message = await MessageModel.findOne({ replyToken }).select(
    "content createdAt reply"
  );
  if (!message) notFound();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-dot-grid py-16 px-4">
      <div className="relative max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-2">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-blue text-on-brand">
            <MessageSquare className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            Your anonymous message
          </h1>
          <p className="text-muted-foreground">
            This link is the only way to check for a reply — nothing is
            emailed and no account is tied to it.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              You said
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-line">
              {message.content}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Sent{" "}
              {formatDistanceToNow(new Date(message.createdAt), {
                addSuffix: true,
              })}
            </p>
          </CardContent>
        </Card>

        {message.reply ? (
          <Card className="bg-brand-mint/25">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Reply className="h-4 w-4" />
                They replied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground whitespace-pre-line">
                {message.reply.content}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Replied{" "}
                {formatDistanceToNow(new Date(message.reply.repliedAt), {
                  addSuffix: true,
                })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-ink/40 py-10 text-center">
            <p className="text-sm font-bold text-foreground">No reply yet</p>
            <p className="text-sm text-muted-foreground">
              Check back later — bookmark this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
