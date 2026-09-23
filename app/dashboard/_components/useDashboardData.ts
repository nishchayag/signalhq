"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import axios from "axios";
import type { IQuestion } from "@/models/question.model";
import type { IMessage } from "@/models/message.model";
import type { MembershipRole } from "@/models/membership.model";
import { can } from "@/lib/permissions";
import { apiError } from "@/lib/apiError";

export interface ThreadEntry {
  authorRole: "member" | "org";
  content: string;
  createdAt: string;
}

export interface ThreadSummary {
  _id: string;
  content: string;
  createdAt: string;
  replies: ThreadEntry[];
  authorUserId?: { _id: string; name: string; username: string } | null;
}

export type DashboardView = "general" | "question";

/**
 * All dashboard state and data-fetching, shared by the sidebar (desktop
 * aside and the mobile sheet) and the main views. Kept in one hook because
 * sidebar actions (select/refresh/delete a question) drive main-view state.
 */
export function useDashboardData() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<IQuestion | null>(null);
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
  const [view, setView] = useState<DashboardView>("general");
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [internalThreads, setInternalThreads] = useState<ThreadSummary[]>([]);
  const [myThread, setMyThread] = useState<ThreadSummary | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  // Per-fetch errors, so a failed load renders ErrorState + Retry instead of
  // the "No … yet" empty state it used to fall through to.
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);

  // Monotonic request ids: a response is applied only if no newer request of
  // the same kind (or a view switch) happened meanwhile. Without this, a slow
  // reply for question A arriving after you clicked B called
  // setSelectedQuestion(A) and yanked the view back.
  const questionReq = useRef(0);
  const generalReq = useRef(0);

  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const orgSlug = session?.user?.activeOrgSlug;

  const fetchTeams = async () => {
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    setTeamsError(null);
    try {
      const res = await axios.get(`/api/organizations/${orgId}/teams`);
      if (res.data.success) setTeams(res.data.teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      setTeamsError(apiError(error, "Couldn't load teams"));
    }
  };

  const fetchQuestions = async () => {
    setQuestionsError(null);
    try {
      const response = await axios.get("/api/questions");
      if (response.data.success) {
        setQuestions(response.data.questions);
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
      setQuestionsError(apiError(error, "Couldn't load your questions"));
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralMessages = async (search?: string) => {
    const req = ++generalReq.current;
    setGeneralError(null);
    try {
      const response = await axios.get("/api/getMessages", {
        params: { q: search || undefined },
      });
      if (req !== generalReq.current) return;
      if (response.data.success) {
        setGeneralMessages(response.data.messages);
        setGeneralHasMore(response.data.hasMore);
        setGeneralCursor(response.data.nextCursor);
      }
    } catch (error) {
      if (req !== generalReq.current) return;
      console.error("Error fetching general messages:", error);
      setGeneralError(apiError(error, "Couldn't load messages"));
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

  // Keyed on the active org, not the session object: useSession hands back a
  // new object on every refetch (window focus etc.), which used to refetch
  // everything and throw away loaded "Load more" pages and the search.
  const orgKey = session ? session.user?.activeOrgId ?? "none" : null;
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (orgKey) {
      fetchQuestions();
      fetchGeneralMessages();
      fetchTeams();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey]);

  const fetchQuestionMessages = async (questionId: string, search?: string) => {
    const req = ++questionReq.current;
    setMessagesLoading(true);
    setQuestionError(null);
    try {
      const response = await axios.get(`/api/questions/${questionId}`, {
        params: { q: search || undefined },
      });
      if (req !== questionReq.current) return; // superseded — don't touch the view
      if (response.data.success) {
        setMessages(response.data.messages);
        setSelectedQuestion(response.data.question);
        setMessagesHasMore(response.data.hasMore);
        setMessagesCursor(response.data.nextCursor);
      }
    } catch (error) {
      if (req !== questionReq.current) return;
      console.error("Error fetching question messages:", error);
      setQuestionError(apiError(error, "Couldn't load responses"));
    } finally {
      if (req === questionReq.current) setMessagesLoading(false);
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
      const response = await axios.get(`/api/questions/${selectedQuestion._id}`, {
        params: { before: messagesCursor, q: messagesSearch || undefined },
      });
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

  const fetchInternalQuestionData = async (questionId: string, viewAllReplies: boolean) => {
    const req = ++questionReq.current;
    setInternalLoading(true);
    setQuestionError(null);
    try {
      if (viewAllReplies) {
        const res = await axios.get(`/api/questions/${questionId}/replies`);
        if (req === questionReq.current && res.data.success) setInternalThreads(res.data.threads);
      } else {
        const res = await axios.get(`/api/questions/${questionId}/answer`);
        if (req === questionReq.current && res.data.success) setMyThread(res.data.thread);
      }
    } catch (error) {
      if (req !== questionReq.current) return;
      console.error("Error fetching internal question replies:", error);
      setQuestionError(apiError(error, "Couldn't load answers"));
    } finally {
      if (req === questionReq.current) setInternalLoading(false);
    }
  };

  /** Invalidate in-flight question requests and pending search debounces. */
  const cancelPendingQuestionWork = () => {
    questionReq.current++;
    if (messagesSearchTimer.current) clearTimeout(messagesSearchTimer.current);
    messagesSearchTimer.current = null;
  };

  const handleGeneralView = () => {
    cancelPendingQuestionWork();
    setMessagesLoading(false);
    setInternalLoading(false);
    setQuestionError(null);
    setView("general");
    setSelectedQuestion(null);
    setMessages([]);
    setMessagesHasMore(false);
    setMessagesCursor(null);
    setInternalThreads([]);
    setMyThread(null);
  };

  const handleQuestionSelect = (question: IQuestion) => {
    // Clicking the already-selected question unselects it, returning to the
    // general view (feedback link + general messages).
    if (selectedQuestion?._id === question._id) {
      handleGeneralView();
      return;
    }
    cancelPendingQuestionWork();
    setSelectedQuestion(question);
    setView("question");
    setInternalThreads([]);
    setMyThread(null);
    setAnswerDraft("");
    setMessagesSearch("");
    if (question.visibility === "internal") {
      fetchInternalQuestionData(question._id, can(role, "question:viewAllReplies"));
    } else {
      fetchQuestionMessages(question._id);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion || !answerDraft.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await axios.post(`/api/questions/${selectedQuestion._id}/answer`, {
        content: answerDraft.trim(),
      });
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

  const copyQuestionLink = (slug: string) => {
    const path = orgSlug ? `/o/${orgSlug}/q/${slug}` : `/q/${slug}`;
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast.success("Question link copied to clipboard!");
  };

  const handleDeleteMessage = (messageId: string) => {
    const drop = (msgs: IMessage[]) => msgs.filter((msg) => msg._id !== messageId);
    if (view === "general") setGeneralMessages(drop);
    else setMessages(drop);
  };

  const handleReplySaved = (messageId: string, reply: { content: string; repliedAt: string }) => {
    const applyReply = (msgs: IMessage[]) =>
      msgs.map((m) => (m._id === messageId ? ({ ...m, reply } as unknown as IMessage) : m));
    if (view === "general") setGeneralMessages(applyReply);
    else setMessages(applyReply);
  };

  const handleQuestionCreated = (newQuestion: IQuestion) => {
    setQuestions((prev) => [newQuestion, ...prev]);
    setShowCreateDialog(false);
    toast.success("Question created successfully!");
  };

  const handleToggleActive = async (questionId: string, currentStatus: boolean) => {
    try {
      const response = await axios.patch(`/api/questions/${questionId}`, {
        isActive: !currentStatus,
      });
      if (response.data.success) {
        setQuestions((prev) =>
          prev.map((q) => (q._id === questionId ? ({ ...q, isActive: !currentStatus } as IQuestion) : q))
        );
        toast.success(`Question ${!currentStatus ? "activated" : "deactivated"} successfully`);
      } else {
        toast.error("Failed to update question status");
      }
    } catch (error) {
      console.error("Error toggling question status:", error);
      toast.error("Failed to update question status");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question? This action cannot be undone.")) {
      return;
    }
    try {
      const response = await axios.delete(`/api/questions/${questionId}`);
      if (response.data.success) {
        setQuestions((prev) => prev.filter((q) => q._id !== questionId));
        // Clears messages/cursor/threads too, not just the selection.
        if (selectedQuestion?._id === questionId) handleGeneralView();
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
    const isSelected = selectedQuestion?._id === questionId;
    setRefreshingQuestionId(questionId);
    try {
      if (isSelected && selectedQuestion?.visibility === "internal") {
        await fetchInternalQuestionData(questionId, can(role, "question:viewAllReplies"));
        toast.success("Question refreshed");
        return;
      }
      const response = await axios.get(`/api/questions/${questionId}`, {
        params: { q: (isSelected && messagesSearch) || undefined },
      });
      if (response.data.success) {
        setQuestions((prev) =>
          prev.map((q) =>
            q._id === questionId
              ? ({ ...q, responseCount: response.data.question.responseCount } as IQuestion)
              : q
          )
        );
        if (isSelected) {
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

  const retryQuestion = () => {
    if (!selectedQuestion) return;
    if (selectedQuestion.visibility === "internal") {
      fetchInternalQuestionData(selectedQuestion._id, can(role, "question:viewAllReplies"));
    } else {
      fetchQuestionMessages(selectedQuestion._id, messagesSearch);
    }
  };

  const teamNameById: Record<string, string> = Object.fromEntries(teams.map((t) => [t._id, t.name]));
  const filteredQuestions = questions.filter((q) => {
    if (teamFilter === "all") return true;
    if (teamFilter === "none") return !q.teamId;
    return String(q.teamId) === teamFilter;
  });

  return {
    // session-derived
    orgSlug,
    canReply: can(role, "message:reply"),
    canViewAllReplies: can(role, "question:viewAllReplies"),
    canDelete: can(role, "message:delete"),
    canUpdateQuestions: can(role, "question:update"),
    canDeleteQuestions: can(role, "question:delete"),
    // state
    loading,
    view,
    questions,
    filteredQuestions,
    selectedQuestion,
    teams,
    teamFilter,
    setTeamFilter,
    teamNameById,
    refreshingQuestionId,
    showCreateDialog,
    setShowCreateDialog,
    generalMessages,
    generalHasMore,
    generalLoadingMore,
    generalSearch,
    messages,
    messagesLoading,
    messagesHasMore,
    messagesLoadingMore,
    messagesSearch,
    internalThreads,
    myThread,
    internalLoading,
    answerDraft,
    setAnswerDraft,
    submittingAnswer,
    questionsError,
    generalError,
    teamsError,
    questionError,
    // actions
    retryQuestions: fetchQuestions,
    retryGeneral: () => fetchGeneralMessages(generalSearch),
    retryTeams: fetchTeams,
    retryQuestion,
    handleGeneralView,
    handleQuestionSelect,
    handleGeneralSearchChange,
    handleMessagesSearchChange,
    loadMoreGeneralMessages,
    loadMoreQuestionMessages,
    exportGeneralMessagesCsv,
    exportQuestionMessagesCsv,
    handleSubmitAnswer,
    copyQuestionLink,
    handleDeleteMessage,
    handleReplySaved,
    handleQuestionCreated,
    handleToggleActive,
    handleDeleteQuestion,
    handleRefreshQuestion,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
