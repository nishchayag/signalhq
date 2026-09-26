import { notFound } from "next/navigation";
import type { Types } from "mongoose";
import connectDB from "@/lib/connectDB";
import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { threadOf } from "@/lib/thread";
import { loadReceipt } from "@/lib/receipt";
import MessageModel from "@/models/message.model";
import { isGuardOffered } from "@/lib/aiQuota";
import SenderFollowUpForm from "@/components/SenderFollowUpForm";

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

  // Thread fields only — never "+ai" or the embedding.
  const message = await loadReceipt(replyToken);
  if (!message) notFound();

  // Guard availability needs the owning org, which the sender-facing receipt
  // fields (lib/receipt.ts#RECEIPT_FIELDS) deliberately don't include — a
  // second, narrower lookup just for this boolean, never sent to the client.
  const orgLookup = await MessageModel.findOne({ replyToken })
    .select("organizationId")
    .lean<{ organizationId?: Types.ObjectId }>();
  const guardAvailable = orgLookup?.organizationId
    ? await isGuardOffered(orgLookup.organizationId)
    : false;

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

        <SenderFollowUpForm
          replyToken={replyToken}
          initialTurns={threadOf(message)}
          guardAvailable={guardAvailable}
        />
      </div>
    </div>
  );
}
