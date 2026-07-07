"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  MessageSquare,
  HelpCircle,
  Copy,
  ExternalLink,
  Download,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Settings,
  User,
  Search,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";
import { IMessage } from "@/models/message.model";
import MessageCard from "@/components/MessageCard";
import CreateQuestionDialog from "@/components/CreateQuestionDialog";
import OrgSwitcher from "@/components/OrgSwitcher";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/permissions";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import { PageLoader } from "@/components/Loader";
import type { MembershipRole } from "@/models/membership.model";

interface ThreadEntry {
  authorRole: "member" | "org";
  content: string;
  createdAt: string;
}

interface ThreadSummary {
  _id: string;
  content: string;
  createdAt: string;
  replies: ThreadEntry[];
  authorUserId?: { _id: string; name: string; username: string } | null;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<IQuestion | null>(
    null
  );
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [generalMessages, setGeneralMessages] = useState<IMessage[]>([]);
  const [generalHasMore, setGeneralHasMore] = useState(false);
  const [generalCursor, setGeneralCursor] = useState<string | null>(null);
  const [generalLoadingMore, setGeneralLoadingMore] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [generalSearch, setGeneralSearch] = useState("");
  const [messagesSearch, setMessagesSearch] = useState("");
  const generalSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [view, setView] = useState<"general" | "question">("general");
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<
    string | null
  >(null);
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [internalThreads, setInternalThreads] = useState<ThreadSummary[]>([]);
  const [myThread, setMyThread] = useState<ThreadSummary | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const fetchTeams = async () => {
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/teams`);
      if (res.data.success) setTeams(res.data.teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
    }
  };

  const fetchQuestions = async () => {
    try {
      const response = await axios.get("/api/questions");
      if (response.data.success) {
        setQuestions(response.data.questions);
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralMessages = async (search?: string) => {
    try {
      const response = await axios.get("/api/getMessages", {
        params: { q: search || undefined },
      });
      if (response.data.success) {
        setGeneralMessages(response.data.messages);
        setGeneralHasMore(response.data.hasMore);
        setGeneralCursor(response.data.nextCursor);
      }
    } catch (error) {
      console.error("Error fetching general messages:", error);
    }
  };

  const handleGeneralSearchChange = (value: string) => {
    setGeneralSearch(value);
    if (generalSearchTimer.current) clearTimeout(generalSearchTimer.current);
    generalSearchTimer.current = setTimeout(() => {
      fetchGeneralMessages(value);
    }, 300);
  };

  const loadMoreGeneralMessages = async () => {
    if (!generalCursor) return;
    setGeneralLoadingMore(true);
    try {
      const response = await axios.get("/api/getMessages", {
        params: { before: generalCursor, q: generalSearch || undefined },
      });
      if (response.data.success) {
        setGeneralMessages((prev) => [...prev, ...response.data.messages]);
        setGeneralHasMore(response.data.hasMore);
        setGeneralCursor(response.data.nextCursor);
      }
    } catch (error) {
      console.error("Error loading more general messages:", error);
      toast.error("Failed to load more messages");
    } finally {
      setGeneralLoadingMore(false);
    }
  };

  const exportGeneralMessagesCsv = () => {
    const params = new URLSearchParams();
    if (generalSearch) params.set("q", generalSearch);
    window.location.href = `/api/messages/export?${params.toString()}`;
  };

  const exportQuestionMessagesCsv = () => {
    if (!selectedQuestion) return;
    const params = new URLSearchParams({ questionId: selectedQuestion._id });
    if (messagesSearch) params.set("q", messagesSearch);
    window.location.href = `/api/messages/export?${params.toString()}`;
  };

  useEffect(() => {
    // Standard fetch-on-mount/session-change.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (session) {
      fetchQuestions();
      fetchGeneralMessages();
      fetchTeams();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session]);

  const fetchQuestionMessages = async (questionId: string, search?: string) => {
    setMessagesLoading(true);
    try {
      const response = await axios.get(`/api/questions/${questionId}`, {
        params: { q: search || undefined },
      });
      if (response.data.success) {
        setMessages(response.data.messages);
        setSelectedQuestion(response.data.question);
        setMessagesHasMore(response.data.hasMore);
        setMessagesCursor(response.data.nextCursor);
      }
    } catch (error) {
      console.error("Error fetching question messages:", error);
      toast.error("Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleMessagesSearchChange = (value: string) => {
    setMessagesSearch(value);
    if (!selectedQuestion) return;
    if (messagesSearchTimer.current) clearTimeout(messagesSearchTimer.current);
    const questionId = selectedQuestion._id;
    messagesSearchTimer.current = setTimeout(() => {
      fetchQuestionMessages(questionId, value);
    }, 300);
  };

  const loadMoreQuestionMessages = async () => {
    if (!selectedQuestion || !messagesCursor) return;
    setMessagesLoadingMore(true);
    try {
      const response = await axios.get(
        `/api/questions/${selectedQuestion._id}`,
        { params: { before: messagesCursor, q: messagesSearch || undefined } }
      );
      if (response.data.success) {
        setMessages((prev) => [...prev, ...response.data.messages]);
        setMessagesHasMore(response.data.hasMore);
        setMessagesCursor(response.data.nextCursor);
      }
    } catch (error) {
      console.error("Error loading more question messages:", error);
      toast.error("Failed to load more messages");
    } finally {
      setMessagesLoadingMore(false);
    }
  };

  const fetchInternalQuestionData = async (
    questionId: string,
    viewAllReplies: boolean
  ) => {
    setInternalLoading(true);
    try {
      if (viewAllReplies) {
        const res = await axios.get(`/api/questions/${questionId}/replies`);
        if (res.data.success) setInternalThreads(res.data.threads);
      } else {
        const res = await axios.get(`/api/questions/${questionId}/answer`);
        if (res.data.success) setMyThread(res.data.thread);
      }
    } catch (error) {
      console.error("Error fetching internal question replies:", error);
      toast.error("Failed to load replies");
    } finally {
      setInternalLoading(false);
    }
  };

  const handleQuestionSelect = (question: IQuestion) => {
    // Clicking the already-selected question unselects it, returning to the
    // general view (feedback link + general messages).
    if (selectedQuestion?._id === question._id) {
      handleGeneralView();
      return;
    }
    setSelectedQuestion(question);
    setView("question");
    setInternalThreads([]);
    setMyThread(null);
    setAnswerDraft("");
    setMessagesSearch("");
    if (question.visibility === "internal") {
      fetchInternalQuestionData(
        question._id,
        can(
          session?.user?.activeOrgRole as MembershipRole | undefined,
          "question:viewAllReplies"
        )
      );
    } else {
      fetchQuestionMessages(question._id);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion || !answerDraft.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await axios.post(
        `/api/questions/${selectedQuestion._id}/answer`,
        { content: answerDraft.trim() }
      );
      if (res.data.success) {
        setAnswerDraft("");
        toast.success("Answer submitted");
        fetchInternalQuestionData(selectedQuestion._id, false);
      } else {
        toast.error(res.data.message || "Failed to submit answer");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to submit answer");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleGeneralView = () => {
    setView("general");
    setSelectedQuestion(null);
    setMessages([]);
    setMessagesHasMore(false);
    setMessagesCursor(null);
    setInternalThreads([]);
    setMyThread(null);
  };

  const orgSlug = session?.user?.activeOrgSlug;

  const copyQuestionLink = (slug: string) => {
    const path = orgSlug ? `/o/${orgSlug}/q/${slug}` : `/q/${slug}`;
    const link = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(link);
    toast.success("Question link copied to clipboard!");
  };

  const handleDeleteMessage = (messageId: string) => {
    if (view === "general") {
      setGeneralMessages(
        generalMessages.filter((msg) => msg._id !== messageId)
      );
    } else {
      setMessages(messages.filter((msg) => msg._id !== messageId));
    }
  };

  const handleReplySaved = (
    messageId: string,
    reply: { content: string; repliedAt: string }
  ) => {
    const applyReply = (msgs: IMessage[]) =>
      msgs.map((m) =>
        m._id === messageId ? ({ ...m, reply } as unknown as IMessage) : m
      );
    if (view === "general") {
      setGeneralMessages(applyReply(generalMessages));
    } else {
      setMessages(applyReply(messages));
    }
  };

  const canReply = can(
    session?.user?.activeOrgRole as MembershipRole | undefined,
    "message:reply"
  );
  const canViewAllReplies = can(
    session?.user?.activeOrgRole as MembershipRole | undefined,
    "question:viewAllReplies"
  );
  const canDelete = can(
    session?.user?.activeOrgRole as MembershipRole | undefined,
    "message:delete"
  );
  const canUpdateQuestions = can(
    session?.user?.activeOrgRole as MembershipRole | undefined,
    "question:update"
  );
  const canDeleteQuestions = can(
    session?.user?.activeOrgRole as MembershipRole | undefined,
    "question:delete"
  );

  const handleQuestionCreated = (newQuestion: IQuestion) => {
    setQuestions([newQuestion, ...questions]);
    setShowCreateDialog(false);
    toast.success("Question created successfully!");
  };

  const handleToggleActive = async (
    questionId: string,
    currentStatus: boolean
  ) => {
    try {
      const response = await axios.patch(`/api/questions/${questionId}`, {
        isActive: !currentStatus,
      });

      if (response.data.success) {
        setQuestions(
          questions.map((q) =>
            q._id === questionId
              ? ({ ...q, isActive: !currentStatus } as IQuestion)
              : q
          )
        );
        toast.success(
          `Question ${!currentStatus ? "activated" : "deactivated"} successfully`
        );
      } else {
        toast.error("Failed to update question status");
      }
    } catch (error) {
      console.error("Error toggling question status:", error);
      toast.error("Failed to update question status");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this question? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await axios.delete(`/api/questions/${questionId}`);

      if (response.data.success) {
        setQuestions(questions.filter((q) => q._id !== questionId));
        if (selectedQuestion?._id === questionId) {
          setSelectedQuestion(null);
          setView("general");
        }
        toast.success("Question deleted successfully");
      } else {
        toast.error("Failed to delete question");
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    }
  };

  const handleRefreshQuestion = async (questionId: string) => {
    setRefreshingQuestionId(questionId);
    try {
      const response = await axios.get(`/api/questions/${questionId}`);
      if (response.data.success) {
        // Update the question's response count
        setQuestions(
          questions.map((q) =>
            q._id === questionId
              ? ({
                  ...q,
                  responseCount: response.data.question.responseCount,
                } as IQuestion)
              : q
          )
        );

        // If this question is currently selected, refresh its messages
        if (selectedQuestion?._id === questionId) {
          setMessages(response.data.messages);
          setMessagesHasMore(response.data.hasMore);
          setMessagesCursor(response.data.nextCursor);
        }

        toast.success("Question refreshed successfully");
      }
    } catch (error) {
      console.error("Error refreshing question:", error);
      toast.error("Failed to refresh question");
    } finally {
      setRefreshingQuestionId(null);
    }
  };

  const teamNameById: Record<string, string> = Object.fromEntries(
    teams.map((t) => [t._id, t.name])
  );
  const filteredQuestions = questions.filter((q) => {
    if (teamFilter === "all") return true;
    if (teamFilter === "none") return !q.teamId;
    return String(q.teamId) === teamFilter;
  });

  if (loading) {
    return (
      <PageLoader label="Loading your dashboard…" />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r-2 border-ink bg-card md:block">
          <div className="border-b-2 border-ink p-5">
            <h1 className="text-lg font-black tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your feedback
            </p>
          </div>

          {/* Organization switcher + management */}
          <div className="space-y-2 border-b-2 border-ink p-4">
            <OrgSwitcher />
            <Link
              href="/dashboard/organization"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Organization settings
            </Link>
            <Link
              href="/dashboard/account"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <User className="h-4 w-4" />
              Account settings
            </Link>
          </div>

          <div className="p-4">
            {/* General messages */}
            <button
              onClick={handleGeneralView}
              className={`mb-6 w-full rounded-xl border-2 p-3 text-left transition-colors ${
                view === "general"
                  ? "border-ink bg-brand-yellow text-ink shadow-solid-sm"
                  : "border-transparent hover:bg-secondary"
              }`}
            >
              <div className="flex items-center">
                <MessageSquare className="mr-3 h-5 w-5" />
                <div>
                  <div className="font-bold">General messages</div>
                  <div className="text-xs font-medium opacity-80">
                    {generalMessages.length} messages
                  </div>
                </div>
              </div>
            </button>

            {/* Questions */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Questions
              </h2>
              <Button
                onClick={() => setShowCreateDialog(true)}
                size="sm"
                className="h-8 px-3"
              >
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>

            {teams.length > 0 && (
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="mb-3 w-full rounded-lg border-2 border-ink bg-card px-2 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All teams</option>
                <option value="none">Organization-wide</option>
                {teams.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <div className="space-y-1.5">
              {filteredQuestions.map((question) => (
                <button
                  key={question._id}
                  onClick={() => handleQuestionSelect(question)}
                  className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                    selectedQuestion?._id === question._id
                      ? "border-ink bg-brand-mint shadow-solid-sm"
                      : "border-transparent hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 flex-1 items-start">
                      <HelpCircle className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate text-sm font-bold text-foreground">
                            {question.questionText}
                          </div>
                          {question.visibility === "internal" && (
                            <span className="shrink-0 rounded border border-ink bg-brand-blue/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground">
                              Internal
                            </span>
                          )}
                        </div>
                        {(question.visibility !== "internal" ||
                          canViewAllReplies) && (
                          <div className="mt-1 text-xs font-medium text-muted-foreground">
                            {question.responseCount} responses
                          </div>
                        )}
                        {teams.length > 0 && (
                          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground/70">
                            {question.teamId
                              ? teamNameById[String(question.teamId)] || "Team"
                              : "Organization-wide"}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center">
                          <span
                            className={`mr-2 h-2 w-2 rounded-full border border-ink ${
                              question.isActive
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/50"
                            }`}
                          />
                          <span className="text-xs font-medium text-muted-foreground">
                            {question.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-2 flex items-center space-x-1">
                      {canUpdateQuestions && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(question._id, question.isActive);
                          }}
                          className="h-8 w-8 p-0"
                          title={
                            question.isActive
                              ? "Deactivate question"
                              : "Activate question"
                          }
                        >
                          {question.isActive ? (
                            <PowerOff className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Power className="h-4 w-4 text-emerald-500" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefreshQuestion(question._id);
                        }}
                        className="h-8 w-8 p-0"
                        title="Refresh question messages"
                        disabled={refreshingQuestionId === question._id}
                      >
                        <RefreshCw
                          className={`h-4 w-4 text-primary ${
                            refreshingQuestionId === question._id
                              ? "animate-spin"
                              : ""
                          }`}
                        />
                      </Button>
                      {canDeleteQuestions && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuestion(question._id);
                          }}
                          className="h-8 w-8 p-0"
                          title="Delete question"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              {filteredQuestions.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-ink/40 py-10 text-center">
                  <HelpCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-bold text-foreground">
                    No questions yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Create your first question to get started
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl p-6 lg:p-8">
            {view === "general" ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-black tracking-tight text-foreground">
                    General messages
                  </h2>
                  <p className="mt-1 text-muted-foreground">
                    Messages sent to your organization&apos;s feedback link
                  </p>
                </div>

                <Card className="mb-6 bg-brand-blue/30">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-foreground">
                          Your feedback link
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Share this link to collect anonymous feedback
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const link = `${window.location.origin}/o/${orgSlug}`;
                            navigator.clipboard.writeText(link);
                            toast.success("Link copied to clipboard!");
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/o/${orgSlug}`, "_blank")}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportGeneralMessagesCsv}
                        >
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
                    value={generalSearch}
                    onChange={(e) => handleGeneralSearchChange(e.target.value)}
                    placeholder="Search messages..."
                    className="pl-9"
                  />
                </div>

                <div className="space-y-4">
                  {generalMessages.map((message) => (
                    <MessageCard
                      key={message._id as string}
                      message={message}
                      onMessageDelete={handleDeleteMessage}
                      canReply={canReply}
                      canDelete={canDelete}
                      onReplySaved={handleReplySaved}
                    />
                  ))}

                  {generalMessages.length === 0 && (
                    <div className="rounded-2xl border-2 border-dashed border-ink/40 py-16 text-center">
                      <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                      <h3 className="mb-1 text-lg font-bold text-foreground">
                        No messages yet
                      </h3>
                      <p className="text-muted-foreground">
                        Share your link to start receiving feedback
                      </p>
                    </div>
                  )}

                  {generalHasMore && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="outline"
                        onClick={loadMoreGeneralMessages}
                        disabled={generalLoadingMore}
                      >
                        {generalLoadingMore ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedQuestion ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-black tracking-tight text-foreground">
                    {selectedQuestion.questionText}
                  </h2>
                  {selectedQuestion.description && (
                    <p className="mt-1 text-muted-foreground">
                      {selectedQuestion.description}
                    </p>
                  )}
                  {selectedQuestion.visibility !== "internal" && (
                    <div className="mt-4 flex gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyQuestionLink(selectedQuestion.slug)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            orgSlug
                              ? `/o/${orgSlug}/q/${selectedQuestion.slug}`
                              : `/q/${selectedQuestion.slug}`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportQuestionMessagesCsv}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  )}
                </div>

                {selectedQuestion.visibility === "internal" ? (
                  <div className="space-y-4">
                    {internalLoading ? (
                      <div className="py-10 text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    ) : canViewAllReplies ? (
                      internalThreads.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-ink/40 py-16 text-center">
                          <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                          <h3 className="mb-1 text-lg font-bold text-foreground">
                            No answers yet
                          </h3>
                          <p className="text-muted-foreground">
                            Each team member&apos;s private thread will show up here
                            once they answer.
                          </p>
                        </div>
                      ) : (
                        internalThreads.map((thread) => (
                          <Card key={thread._id}>
                            <CardContent className="p-4 flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-foreground truncate">
                                    {thread.authorUserId?.name || "Unknown member"}
                                  </p>
                                  <span className="text-xs text-muted-foreground">
                                    @{thread.authorUserId?.username || "unknown"}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground truncate">
                                  {thread.content}
                                </p>
                                {thread.replies.length > 0 && (
                                  <p className="mt-1 text-xs text-muted-foreground/70">
                                    {thread.replies.length} follow-up
                                    {thread.replies.length === 1 ? "" : "s"}
                                  </p>
                                )}
                              </div>
                              <Link
                                href={`/dashboard/questions/${selectedQuestion._id}/replies/${thread._id}`}
                              >
                                <Button variant="outline" size="sm">
                                  View thread
                                </Button>
                              </Link>
                            </CardContent>
                          </Card>
                        ))
                      )
                    ) : myThread ? (
                      <Card>
                        <CardContent className="p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">Your answer</p>
                            <p className="mt-1 text-sm text-muted-foreground truncate">
                              {myThread.content}
                            </p>
                            {myThread.replies.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground/70">
                                {myThread.replies.length} follow-up
                                {myThread.replies.length === 1 ? "" : "s"}
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/dashboard/questions/${selectedQuestion._id}/replies/${myThread._id}`}
                          >
                            <Button variant="outline" size="sm">
                              View thread
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="rounded-2xl border-2 border-ink bg-card p-5 shadow-solid-sm">
                        <p className="mb-3 text-sm text-muted-foreground">
                          Your answer creates a private thread only you and the
                          org&apos;s owner/admins can see.
                        </p>
                        <Textarea
                          value={answerDraft}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                          onKeyDown={enterToSendWith(handleSubmitAnswer)}
                          placeholder="Write your answer..."
                          className="min-h-[100px] resize-none"
                          disabled={submittingAnswer}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {enterToSendHint}
                        </p>
                        <Button
                          className="mt-3"
                          onClick={handleSubmitAnswer}
                          disabled={submittingAnswer || !answerDraft.trim()}
                        >
                          {submittingAnswer ? "Submitting..." : "Submit answer"}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={messagesSearch}
                      onChange={(e) => handleMessagesSearchChange(e.target.value)}
                      placeholder="Search responses..."
                      className="pl-9"
                    />
                  </div>

                  {messagesLoading ? (
                    <div className="py-10 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <MessageCard
                          key={message._id as string}
                          message={message}
                          onMessageDelete={handleDeleteMessage}
                          canReply={canReply}
                          canDelete={canDelete}
                          onReplySaved={handleReplySaved}
                        />
                      ))}

                      {messages.length === 0 && (
                        <div className="rounded-2xl border-2 border-dashed border-ink/40 py-16 text-center">
                          <HelpCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                          <h3 className="mb-1 text-lg font-bold text-foreground">
                            No responses yet
                          </h3>
                          <p className="text-muted-foreground">
                            Share your question link to start collecting
                            responses
                          </p>
                        </div>
                      )}

                      {messagesHasMore && (
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="outline"
                            onClick={loadMoreQuestionMessages}
                            disabled={messagesLoadingMore}
                          >
                            {messagesLoadingMore ? "Loading…" : "Load more"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      <CreateQuestionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onQuestionCreated={handleQuestionCreated}
      />
    </div>
  );
}
