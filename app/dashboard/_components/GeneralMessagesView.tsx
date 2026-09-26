"use client";
import { useState } from "react";
import { Download, ExternalLink, MessageSquare, Search, Share2 } from "lucide-react";
import OnboardingChecklist, { useOnboardingFlags } from "./OnboardingChecklist";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { buildPublicUrl } from "@/lib/publicUrl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MessageCard from "@/components/MessageCard";
import MessageFilters from "@/components/MessageFilters";
import ShareDialog from "@/components/ShareDialog";
import SemanticSearchToggle, {
  SemanticSearchNotes,
  semanticSearchOffered,
} from "@/components/SemanticSearchToggle";
import InsightsPanel from "@/components/InsightsPanel";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadMoreButton from "./LoadMoreButton";
import type { DashboardData } from "./useDashboardData";

/** Org feedback link card + the org's general (non-question) messages. */
export default function GeneralMessagesView({ d }: { d: DashboardData }) {
  const { markCopied } = useOnboardingFlags(d.orgId);
  const [shareOpen, setShareOpen] = useState(false);
  const orgUrl = buildPublicUrl(`/o/${d.orgSlug}`);
  const copyOrgLink = () => {
    navigator.clipboard.writeText(orgUrl);
    markCopied();
    toast.success("Link copied to clipboard!");
    trackEvent("link_copied", "org");
  };
  const openShare = () => {
    markCopied();
    setShareOpen(true);
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
                onClick={openShare}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
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

      <InsightsPanel key={d.orgId} ai={d.ai} refreshAi={d.refreshAi} />

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={d.generalSearch}
              onChange={(e) => d.handleGeneralSearchChange(e.target.value)}
              placeholder={d.generalSemantic && semanticSearchOffered(d.ai) ? "Search by meaning..." : "Search messages..."}
              className="pl-9"
            />
          </div>
          <SemanticSearchToggle ai={d.ai} on={d.generalSemantic} onChange={d.setGeneralSemantic} />
        </div>
        <SemanticSearchNotes ai={d.ai} active={d.generalSemanticActive} truncated={d.generalTruncated} />
      </div>

      <div className="mb-4">
        <MessageFilters
          filters={d.generalFilters}
          onChange={d.setGeneralFilters}
          labels={d.orgLabels}
          members={d.orgMembers}
          onMarkAllRead={() => d.markAllRead({ general: true })}
          markingAllRead={d.markingAllRead}
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
            canTriage={d.canTriage}
            currentUserId={d.currentUserId}
            orgLabels={d.orgLabels}
            orgMembers={d.orgMembers}
            onPatch={d.handlePatchMessage}
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
              <Button variant="outline" size="sm" onClick={openShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share your feedback link
              </Button>
            }
          />
        )}

        {d.generalHasMore && !d.generalSemanticActive && (
          <LoadMoreButton onClick={d.loadMoreGeneralMessages} loading={d.generalLoadingMore} />
        )}
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={orgUrl}
        title="Share your feedback link"
        description="Share this link or QR code to collect anonymous feedback."
        filenameBase={`${d.orgSlug}-feedback`}
        copyEventLabel="org"
      />
    </div>
  );
}
