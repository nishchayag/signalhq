"use client";
import { Copy, Download, ExternalLink, MessageSquare, Search } from "lucide-react";
import OnboardingChecklist, { useOnboardingFlags } from "./OnboardingChecklist";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MessageCard from "@/components/MessageCard";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadMoreButton from "./LoadMoreButton";
import type { DashboardData } from "./useDashboardData";

/** Org feedback link card + the org's general (non-question) messages. */
export default function GeneralMessagesView({ d }: { d: DashboardData }) {
  const { markCopied } = useOnboardingFlags(d.orgId);
  const copyOrgLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/o/${d.orgSlug}`);
    markCopied();
    toast.success("Link copied to clipboard!");
    trackEvent("link_copied", "org");
  };
  return (
    <div>
      <OnboardingChecklist d={d} onCopyLink={copyOrgLink} />

      <div className="mb-6">
        <h2 className="text-2xl font-black tracking-tight text-foreground">General messages</h2>
        <p className="mt-1 text-muted-foreground">Messages sent to your organization&apos;s feedback link</p>
      </div>

      <Card className="mb-6 bg-brand-blue/30">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-foreground">Your feedback link</p>
              <p className="text-sm text-muted-foreground">Share this link to collect anonymous feedback</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyOrgLink}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(`/o/${d.orgSlug}`, "_blank")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button variant="outline" size="sm" onClick={d.exportGeneralMessagesCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={d.generalSearch}
          onChange={(e) => d.handleGeneralSearchChange(e.target.value)}
          placeholder="Search messages..."
          className="pl-9"
        />
      </div>

      <div className="space-y-4">
        {d.generalMessages.map((message) => (
          <MessageCard
            key={message._id as string}
            message={message}
            onMessageDelete={d.handleDeleteMessage}
            canReply={d.canReply}
            canDelete={d.canDelete}
            onReplySaved={d.handleReplySaved}
          />
        ))}

        {d.generalError ? (
          <ErrorState message={d.generalError} onRetry={d.retryGeneral} />
        ) : d.generalMessages.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Share your link to start receiving feedback"
            action={
              <Button variant="outline" size="sm" onClick={copyOrgLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy your feedback link
              </Button>
            }
          />
        )}

        {d.generalHasMore && (
          <LoadMoreButton onClick={d.loadMoreGeneralMessages} loading={d.generalLoadingMore} />
        )}
      </div>
    </div>
  );
}
