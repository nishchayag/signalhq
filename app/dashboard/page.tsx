"use client";
import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  MessageSquare,
  HelpCircle,
  Copy,
  ExternalLink,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import axios from "axios";
import { IQuestion } from "@/models/question.model";
import { IMessage } from "@/models/message.model";
import MessageCard from "@/components/MessageCard";
import CreateQuestionDialog from "@/components/CreateQuestionDialog";
import OrgSwitcher from "@/components/OrgSwitcher";

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
  const [view, setView] = useState<"general" | "question">("general");
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<
    string | null
  >(null);
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");

  useEffect(() => {
    if (session) {
      fetchQuestions();
      fetchGeneralMessages();
      fetchTeams();
    }
  }, [session]);

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

  const fetchGeneralMessages = async () => {
    try {
      const response = await axios.get("/api/getMessages");
      if (response.data.success) {
        // Filter general messages (without questionId)
        const generalMsgs = response.data.messages.filter(
          (msg: IMessage) => !msg.questionId
        );
        setGeneralMessages(generalMsgs);
      }
    } catch (error) {
      console.error("Error fetching general messages:", error);
    }
  };

  const fetchQuestionMessages = async (questionId: string) => {
    setMessagesLoading(true);
    try {
      const response = await axios.get(`/api/questions/${questionId}`);
      if (response.data.success) {
        setMessages(response.data.messages);
        setSelectedQuestion(response.data.question);
      }
    } catch (error) {
      console.error("Error fetching question messages:", error);
      toast.error("Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleQuestionSelect = (question: IQuestion) => {
    setSelectedQuestion(question);
    setView("question");
    fetchQuestionMessages(question._id);
  };

  const handleGeneralView = () => {
    setView("general");
    setSelectedQuestion(null);
    setMessages([]);
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
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-80 shrink-0 overflow-y-auto border-r border-border bg-card md:block">
          <div className="border-b border-border p-5">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your feedback
            </p>
          </div>

          {/* Organization switcher + management */}
          <div className="space-y-2 border-b border-border p-4">
            <OrgSwitcher />
            <Link
              href="/dashboard/organization"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              Organization settings
            </Link>
          </div>

          <div className="p-4">
            {/* General messages */}
            <button
              onClick={handleGeneralView}
              className={`mb-6 w-full rounded-xl border p-3 text-left transition-colors ${
                view === "general"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-transparent hover:bg-accent"
              }`}
            >
              <div className="flex items-center">
                <MessageSquare className="mr-3 h-5 w-5" />
                <div>
                  <div className="font-medium">General messages</div>
                  <div className="text-xs text-muted-foreground">
                    {generalMessages.length} messages
                  </div>
                </div>
              </div>
            </button>

            {/* Questions */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
                className="mb-3 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedQuestion?._id === question._id
                      ? "border-primary/20 bg-primary/10"
                      : "border-transparent hover:bg-accent"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 flex-1 items-start">
                      <HelpCircle className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {question.questionText}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {question.responseCount} responses
                        </div>
                        {teams.length > 0 && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                            {question.teamId
                              ? teamNameById[String(question.teamId)] || "Team"
                              : "Organization-wide"}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center">
                          <span
                            className={`mr-2 h-2 w-2 rounded-full ${
                              question.isActive
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/50"
                            }`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {question.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-2 flex items-center space-x-1">
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
                    </div>
                  </div>
                </button>
              ))}

              {filteredQuestions.length === 0 && (
                <div className="py-10 text-center">
                  <HelpCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-foreground">No questions yet</p>
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
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    General messages
                  </h2>
                  <p className="mt-1 text-muted-foreground">
                    Messages sent to your organization&apos;s feedback link
                  </p>
                </div>

                <Card className="mb-6">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-foreground">
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
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {generalMessages.map((message) => (
                    <MessageCard
                      key={message._id as string}
                      message={message}
                      onMessageDelete={handleDeleteMessage}
                    />
                  ))}

                  {generalMessages.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                      <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                      <h3 className="mb-1 text-lg font-medium text-foreground">
                        No messages yet
                      </h3>
                      <p className="text-muted-foreground">
                        Share your link to start receiving feedback
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedQuestion ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    {selectedQuestion.questionText}
                  </h2>
                  {selectedQuestion.description && (
                    <p className="mt-1 text-muted-foreground">
                      {selectedQuestion.description}
                    </p>
                  )}
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
                  </div>
                </div>

                <div className="space-y-4">
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
                        />
                      ))}

                      {messages.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                          <HelpCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                          <h3 className="mb-1 text-lg font-medium text-foreground">
                            No responses yet
                          </h3>
                          <p className="text-muted-foreground">
                            Share your question link to start collecting
                            responses
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
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
