"use client";
import Link from "next/link";
import {
  Copy,
  Download,
  Pencil,
  ExternalLink,
  HelpCircle,
  MessageSquare,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MessageCard from "@/components/MessageCard";
import InsightsPanel from "@/components/InsightsPanel";
import Loader from "@/components/Loader";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import type { IQuestion } from "@/models/question.model";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadMoreButton from "./LoadMoreButton";
import type { DashboardData, ThreadSummary } from "./useDashboardData";

/** The selected question: header (links/export), then its responses. */
export default function QuestionView({ d, question }: { d: DashboardData; question: IQuestion }) {
  const publicPath = d.orgSlug ? `/o/${d.orgSlug}/q/${question.slug}` : `/q/${question.slug}`;
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-black tracking-tight text-foreground">{question.questionText}</h2>
        {question.description && <p className="mt-1 text-muted-foreground">{question.description}</p>}
        <QuestionActions d={d} question={question} />
        {question.visibility !== "internal" && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={() => d.copyQuestionLink(question.slug)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(publicPath, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={d.exportQuestionMessagesCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      <InsightsPanel key={question._id} questionId={question._id} ai={d.ai} refreshAi={d.refreshAi} />

      {question.visibility === "internal" ? (
        <InternalQuestionView d={d} question={question} />
      ) : (
        <PublicQuestionView d={d} question={question} />
      )}
    </div>
  );
}

/** Manage actions for the selected question. These used to be icon buttons
 *  nested inside each sidebar row (invalid button-in-button, and cramped on
 *  mobile); here they're labelled and live with the thing they act on. */
function QuestionActions({ d, question }: { d: DashboardData; question: IQuestion }) {
  const refreshing = d.refreshingQuestionId === question._id;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold ${
          question.isActive ? "bg-brand-mint text-on-brand" : "bg-muted text-muted-foreground"
        }`}
      >
        {question.isActive ? "Accepting responses" : "Paused"}
      </span>
      {d.canUpdateQuestions && (
        <Button variant="ghost" size="sm" onClick={() => d.setEditingQuestion(question)}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Edit
        </Button>
      )}
      {d.canUpdateQuestions && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => d.handleToggleActive(question._id, question.isActive)}
        >
          {question.isActive ? <PowerOff className="mr-1.5 h-4 w-4" /> : <Power className="mr-1.5 h-4 w-4" />}
          {question.isActive ? "Pause" : "Resume"}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => d.handleRefreshQuestion(question._id)} disabled={refreshing}>
        <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        Refresh
      </Button>
      {d.canDeleteQuestions && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => d.handleDeleteQuestion(question._id)}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Delete
        </Button>
      )}
    </div>
  );
}

function ThreadCard({
  questionId,
  thread,
  heading,
  subheading,
}: {
  questionId: string;
  thread: ThreadSummary;
  heading: string;
  subheading?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold text-foreground">{heading}</p>
            {subheading && <span className="text-xs text-muted-foreground">{subheading}</span>}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{thread.content}</p>
          {thread.replies.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              {thread.replies.length} follow-up{thread.replies.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/questions/${questionId}/replies/${thread._id}`}>View thread</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Internal question: admins see every member's private thread; a member
 *  sees their own thread, or the form to start it. */
function InternalQuestionView({ d, question }: { d: DashboardData; question: IQuestion }) {
  if (d.internalLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader size="sm" label="Loading answers…" />
      </div>
    );
  }

  if (d.questionError) {
    return <ErrorState message={d.questionError} onRetry={d.retryQuestion} />;
  }

  if (d.canViewAllReplies) {
    return (
      <div className="space-y-4">
        {d.internalThreads.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No answers yet"
            description="Each team member's private thread will show up here once they answer."
          />
        ) : (
          d.internalThreads.map((thread) => (
            <ThreadCard
              key={thread._id}
              questionId={question._id}
              thread={thread}
              heading={thread.authorUserId?.name || "Unknown member"}
              subheading={`@${thread.authorUserId?.username || "unknown"}`}
            />
          ))
        )}
      </div>
    );
  }

  if (d.myThread) {
    return <ThreadCard questionId={question._id} thread={d.myThread} heading="Your answer" />;
  }

  return (
    <div className="rounded-2xl border-2 border-ink bg-card p-5 shadow-solid-sm">
      <p className="mb-3 text-sm text-muted-foreground">
        Your answer creates a private thread only you and the org&apos;s owner/admins can see.
      </p>
      <Textarea
        value={d.answerDraft}
        onChange={(e) => d.setAnswerDraft(e.target.value)}
        onKeyDown={enterToSendWith(d.handleSubmitAnswer)}
        placeholder="Write your answer..."
        aria-label="Your answer"
        className="min-h-[100px] resize-none"
        disabled={d.submittingAnswer}
      />
      <p className="mt-1 text-xs text-muted-foreground">{enterToSendHint}</p>
      <Button
        className="mt-3"
        onClick={d.handleSubmitAnswer}
        disabled={d.submittingAnswer || !d.answerDraft.trim()}
      >
        {d.submittingAnswer ? "Submitting..." : "Submit answer"}
      </Button>
    </div>
  );
}

/** Public question: searchable, paginated anonymous responses. */
function PublicQuestionView({ d, question }: { d: DashboardData; question: IQuestion }) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={d.messagesSearch}
          onChange={(e) => d.handleMessagesSearchChange(e.target.value)}
          placeholder="Search responses..."
          className="pl-9"
        />
      </div>

      {d.messagesLoading ? (
        <div className="flex justify-center py-10">
          <Loader size="sm" label="Loading responses…" />
        </div>
      ) : d.questionError ? (
        <ErrorState message={d.questionError} onRetry={d.retryQuestion} />
      ) : (
        <>
          {d.messages.map((message) => (
            <MessageCard
              key={message._id as string}
              message={message}
              onMessageDelete={d.handleDeleteMessage}
              canReply={d.canReply}
              canDelete={d.canDelete}
              onReplySaved={d.handleReplySaved}
            />
          ))}

          {d.messages.length === 0 && (
            <EmptyState
              icon={HelpCircle}
              title={d.messagesSearch ? "No responses match your search" : "No responses yet"}
              description={d.messagesSearch ? undefined : "Share your question link to start collecting responses"}
              action={
                d.messagesSearch ? undefined : (
                  <Button variant="outline" size="sm" onClick={() => d.copyQuestionLink(question.slug)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy question link
                  </Button>
                )
              }
            />
          )}

          {d.messagesHasMore && (
            <LoadMoreButton onClick={d.loadMoreQuestionMessages} loading={d.messagesLoadingMore} />
          )}
        </>
      )}
    </div>
  );
}
