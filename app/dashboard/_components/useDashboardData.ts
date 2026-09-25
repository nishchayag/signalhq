"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import axios from "axios";
import type { IQuestion } from "@/models/question.model";
import type { MessageView } from "@/lib/messageView";
import type { MembershipRole } from "@/models/membership.model";
import { can } from "@/lib/permissions";
import { apiError } from "@/lib/apiError";
import { useConfirm } from "@/components/ConfirmProvider";
import type { AiFeature } from "@/models/aiUsage.model";
import { useMessageTriage } from "./useMessageTriage";
import type { PatchMessageRequest } from "@/schemas/triageSchema";
import { publicQuestionConfig, type MessageAnswer } from "@/lib/answers";
import { buildAnswerBody, canSubmitAnswer, emptyAnswerValues, type AnswerFormValues } from "@/lib/answerForm";
import { resolveUrlFilters, type ParsedUrlFilters } from "@/lib/dashboardUrlFilters";

export interface AiStatus {
  enabled: boolean;
  usage?: Record<AiFeature, { used: number; limit: number | null }>;
  resetsAt?: string;
  can: {
    suggest: boolean;
    insights: boolean;
    draft: boolean;
    viewSafety: boolean;
    search: boolean;
  };
}

export interface ThreadEntry {
  authorRole: "member" | "org" | "sender";
  content: string;
  createdAt: string;
}

export interface ThreadSummary {
  _id: string;
  content: string;
  answer?: MessageAnswer;
  createdAt: string;
  replies: ThreadEntry[];
  authorUserId?: { _id: string; name: string; username: string } | null;
}

export type DashboardView = "general" | "question";

/** Semantic mode only kicks in once the query is long enough (server min 3). */
export const SEMANTIC_MIN_QUERY = 3;
function isSemanticQuery(on: boolean, search?: string): boolean {
  return on && (search ?? "").trim().length >= SEMANTIC_MIN_QUERY;
}

/**
 * All dashboard state and data-fetching, shared by the sidebar (desktop
 * aside and the mobile sheet) and the main views. Kept in one hook because
 * sidebar actions (select/refresh/delete a question) drive main-view state.
 */
export function useDashboardData() {
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<IQuestion | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<IQuestion | null>(null);
  const [generalMessages, setGeneralMessages] = useState<MessageView[]>([]);
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
  // Semantic ("by meaning") search toggles, one per list. Refs mirror them
  // so debounced fetches read the current value, not a stale closure.
  const [generalSemantic, setGeneralSemanticState] = useState(false);
  const [messagesSemantic, setMessagesSemanticState] = useState(false);
  const generalSemanticRef = useRef(false);
  const messagesSemanticRef = useRef(false);
  const [generalTruncated, setGeneralTruncated] = useState(false);
  const [messagesTruncated, setMessagesTruncated] = useState(false);
  const [view, setView] = useState<DashboardView>("general");
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ _id: string; name: string }[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [internalThreads, setInternalThreads] = useState<ThreadSummary[]>([]);
  const [myThread, setMyThread] = useState<ThreadSummary | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [answerValues, setAnswerValues] = useState<AnswerFormValues>(emptyAnswerValues());
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  // Per-fetch errors, so a failed load renders ErrorState + Retry instead of
  // the "No … yet" empty state it used to fall through to.
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  // Sticky "this org has received general feedback" — set from unsearched
  // loads only, so typing a search that matches nothing can't flip it back.
  const [hadGeneralMessages, setHadGeneralMessages] = useState(false);
  // AI status for the active org: enabled flag, this month's usage, and
  // which AI controls this role may use. null while loading (or before an
  // org is active) so callers can distinguish "not fetched yet" from
  // "fetched, disabled". A fetch failure is treated as disabled rather than
  // surfacing an error state — AI is an enhancement, not core functionality.
  const [ai, setAi] = useState<AiStatus | null>(null);

  // Monotonic request ids: a response is applied only if no newer request of
  // the same kind (or a view switch) happened meanwhile. Without this, a slow
  // reply for question A arriving after you clicked B called
  // setSelectedQuestion(A) and yanked the view back.
  const questionReq = useRef(0);
  const generalReq = useRef(0);

  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const orgSlug = session?.user?.activeOrgSlug;

  const triage = useMessageTriage({
    orgId: session?.user?.activeOrgId,
    role,
    // Filters are never debounced: refetch the affected list right away.
    onFiltersChange: (which) => {
      if (which === "general") fetchGeneralMessages(generalSearch);
      else if (selectedQuestion) fetchQuestionMessages(selectedQuestion._id, messagesSearch);
    },
  });

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

  const fetchAi = async () => {
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/ai`);
      setAi(res.data as AiStatus);
    } catch (error) {
      console.error("Error fetching AI status:", error);
      setAi({
        enabled: false,
        can: { suggest: false, insights: false, draft: false, viewSafety: false, search: false },
      });
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
    const semantic = isSemanticQuery(generalSemanticRef.current, search);
    try {
      const response = await axios.get("/api/getMessages", {
        params: {
          q: search || undefined,
          mode: semantic ? "semantic" : undefined,
          ...triage.generalParams(),
        },
      });
      if (req !== generalReq.current) return;
      if (response.data.success) {
        if (!search && response.data.messages.length > 0) setHadGeneralMessages(true);
        setGeneralMessages(response.data.messages);
        setGeneralHasMore(response.data.hasMore);
        setGeneralCursor(response.data.nextCursor);
        setGeneralTruncated(Boolean(response.data.truncated));
      }
    } catch (error) {
      if (req !== generalReq.current) return;
      console.error("Error fetching general messages:", error);
      setGeneralError(apiError(error, "Couldn't load messages"));
    } finally {
      if (semantic) fetchAi();
    }
  };

  const setGeneralSemantic = (on: boolean) => {
    generalSemanticRef.current = on;
    setGeneralSemanticState(on);
    if (generalSearchTimer.current) clearTimeout(generalSearchTimer.current);
    fetchGeneralMessages(generalSearch);
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
        params: { before: generalCursor, q: generalSearch || undefined, ...triage.generalParams() },
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
    for (const [k, v] of Object.entries(triage.generalParams())) {
      if (v) params.set(k, v);
    }
    window.location.href = `/api/messages/export?${params.toString()}`;
  };

  const exportQuestionMessagesCsv = () => {
    if (!selectedQuestion) return;
    const params = new URLSearchParams({ questionId: selectedQuestion._id });
    if (messagesSearch) params.set("q", messagesSearch);
    for (const [k, v] of Object.entries(triage.questionParams())) {
      if (v) params.set(k, v);
    }
    window.location.href = `/api/messages/export?${params.toString()}`;
  };

  // Keyed on the active org, not the session object: useSession hands back a
  // new object on every refetch (window focus etc.), which used to refetch
  // everything and throw away loaded "Load more" pages and the search.
  const orgKey = session ? session.user?.activeOrgId ?? "none" : null;
  // Analytics click-to-filter lands here as `/dashboard?tag=…` or
  // `?sentiment=…` (see AnalyticsPageClient). Parsed once, out of the URL,
  // and remembered against the org it belongs to (see
  // lib/dashboardUrlFilters.ts) — re-applied every time this effect runs for
  // that same org, not just the first time, so React Strict Mode's dev
  // double-invoke (resetForNewOrg, then skip-and-fetch-unfiltered on the
  // second run) can't wipe it. Switching to a different org still ignores it.
  const urlFiltersRef = useRef<{ parsed: ParsedUrlFilters | null; hasParsed: boolean }>({
    parsed: null,
    hasParsed: false,
  });
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (orgKey) {
      // A new org may not offer semantic search; start every org in regex mode.
      generalSemanticRef.current = false;
      messagesSemanticRef.current = false;
      setGeneralSemanticState(false);
      setMessagesSemanticState(false);
      // A new org starts with fresh (unfiltered) triage lists too.
      triage.resetForNewOrg();
      fetchQuestions();
      fetchTeams();
      setAi(null);
      fetchAi();

      const { parsed, apply } = resolveUrlFilters(
        urlFiltersRef.current.parsed,
        urlFiltersRef.current.hasParsed,
        orgKey,
        window.location.search
      );
      urlFiltersRef.current = { parsed, hasParsed: true };
      if (apply) {
        // setGeneralFilters itself triggers the general-list refetch
        // (onFiltersChange), so no separate fetchGeneralMessages() call.
        triage.setGeneralFilters({
          ...(apply.tag ? { tag: apply.tag } : {}),
          ...(apply.sentiment ? { sentiment: apply.sentiment } : {}),
        });
      } else {
        fetchGeneralMessages();
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey]);

  const fetchQuestionMessages = async (questionId: string, search?: string) => {
    const req = ++questionReq.current;
    setMessagesLoading(true);
    setQuestionError(null);
    const semantic = isSemanticQuery(messagesSemanticRef.current, search);
    try {
      const response = await axios.get(`/api/questions/${questionId}`, {
        params: {
          q: search || undefined,
          mode: semantic ? "semantic" : undefined,
          ...triage.questionParams(),
        },
      });
      if (req !== questionReq.current) return; // superseded — don't touch the view
      if (response.data.success) {
        setMessages(response.data.messages);
        setSelectedQuestion(response.data.question);
        setMessagesHasMore(response.data.hasMore);
        setMessagesCursor(response.data.nextCursor);
        setMessagesTruncated(Boolean(response.data.truncated));
      }
    } catch (error) {
      if (req !== questionReq.current) return;
      console.error("Error fetching question messages:", error);
      setQuestionError(apiError(error, "Couldn't load responses"));
    } finally {
      if (req === questionReq.current) setMessagesLoading(false);
      if (semantic) fetchAi();
    }
  };

  const setMessagesSemantic = (on: boolean) => {
    messagesSemanticRef.current = on;
    setMessagesSemanticState(on);
    if (!selectedQuestion) return;
    if (messagesSearchTimer.current) clearTimeout(messagesSearchTimer.current);
    fetchQuestionMessages(selectedQuestion._id, messagesSearch);
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
        params: {
          before: messagesCursor,
          q: messagesSearch || undefined,
          ...triage.questionParams(),
        },
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
    triage.fetchCounts();
  };

  /** General view, pre-filtered to messages assigned to the viewer — the
   * sidebar's "Assigned to me" entry. */
  const handleAssignedToMeView = () => {
    handleGeneralView();
    triage.setGeneralFilters({ assignee: "me" });
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
    setAnswerValues(emptyAnswerValues());
    setMessagesSearch("");
    setMessagesTruncated(false);
    triage.resetQuestionFilters();
    triage.fetchCounts();
    if (question.visibility === "internal") {
      fetchInternalQuestionData(question._id, can(role, "question:viewAllReplies"));
    } else {
      fetchQuestionMessages(question._id);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion) return;
    const config = publicQuestionConfig(selectedQuestion);
    if (!canSubmitAnswer(config, answerValues)) return;
    setSubmittingAnswer(true);
    try {
      const res = await axios.post(
        `/api/questions/${selectedQuestion._id}/answer`,
        buildAnswerBody(config, answerValues)
      );
      if (res.data.success) {
        setAnswerValues(emptyAnswerValues());
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

  const handleDeleteMessage = (messageId: string) => {
    const drop = (msgs: MessageView[]) => msgs.filter((msg) => msg._id !== messageId);
    if (view === "general") setGeneralMessages(drop);
    else setMessages(drop);
  };

  /** Triage PATCH on the message currently shown in the active list
   * (general or the selected question's). Drops the message from an "open"
   * list on archive (or from "archived" on unarchive) — everything else
   * just updates the card in place. See useMessageTriage#patchMessage. */
  const handlePatchMessage = (messageId: string, patch: PatchMessageRequest) => {
    const isGeneral = view === "general";
    const list = isGeneral ? generalMessages : messages;
    const filters = isGeneral ? triage.generalFilters : triage.questionFilters;
    const current = list.find((m) => (m._id as string) === messageId);
    const shouldRemove =
      Boolean(current) &&
      patch.archived !== undefined &&
      filters.status !== "all" &&
      ((filters.status === "open" && patch.archived === true) ||
        (filters.status === "archived" && patch.archived === false));
    return triage.patchMessage(
      messageId,
      patch,
      isGeneral ? setGeneralMessages : setMessages,
      shouldRemove
    );
  };

  const handleQuestionCreated = (newQuestion: IQuestion) => {
    setQuestions((prev) => [newQuestion, ...prev]);
    setShowCreateDialog(false);
    toast.success("Question created successfully!");
    trackEvent("question_created");
  };

  const handleQuestionUpdated = (updated: IQuestion) => {
    // The PUT response is the full updated document (type/config/closesAt/
    // maxResponses included) — spread it wholesale rather than picking two
    // fields, so an edit to the type/options/close-date/cap actually sticks.
    const merge = (q: IQuestion) => ({ ...q, ...updated }) as IQuestion;
    setQuestions((prev) => prev.map((q) => (q._id === updated._id ? merge(q) : q)));
    setSelectedQuestion((prev) => (prev && prev._id === updated._id ? merge(prev) : prev));
    setEditingQuestion(null);
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
    const question = questions.find((q) => q._id === questionId);
    const responses = question?.responseCount ?? 0;
    const ok = await confirm({
      title: "Delete this question?",
      description:
        responses > 0
          ? `Its ${responses} response${responses === 1 ? "" : "s"} will be permanently deleted too. This can't be undone.`
          : "This can't be undone.",
      confirmLabel: "Delete question",
      destructive: true,
      action: () => axios.delete(`/api/questions/${questionId}`),
    });
    if (!ok) return;
    setQuestions((prev) => prev.filter((q) => q._id !== questionId));
    // Clears messages/cursor/threads too, not just the selection.
    if (selectedQuestion?._id === questionId) handleGeneralView();
    toast.success("Question deleted");
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
      const refreshSearch = (isSelected && messagesSearch) || undefined;
      const semantic = isSelected && isSemanticQuery(messagesSemanticRef.current, refreshSearch);
      const response = await axios.get(`/api/questions/${questionId}`, {
        params: {
          q: refreshSearch,
          mode: semantic ? "semantic" : undefined,
          ...(isSelected ? triage.questionParams() : {}),
        },
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
          setMessagesTruncated(Boolean(response.data.truncated));
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
    orgId: session?.user?.activeOrgId,
    orgSlug,
    hasAnyResponse: hadGeneralMessages || questions.some((q) => (q.responseCount ?? 0) > 0),
    canReply: can(role, "message:reply"),
    canViewAllReplies: can(role, "question:viewAllReplies"),
    canDelete: can(role, "message:delete"),
    canUpdateQuestions: can(role, "question:update"),
    canDeleteQuestions: can(role, "question:delete"),
    // Triage
    currentUserId: session?.user?._id as string | undefined,
    canTriage: triage.canTriage,
    canManageLabels: triage.canManageLabels,
    orgLabels: triage.labels,
    orgMembers: triage.members,
    messageCounts: triage.counts,
    generalFilters: triage.generalFilters,
    setGeneralFilters: triage.setGeneralFilters,
    questionFilters: triage.questionFilters,
    setQuestionFilters: triage.setQuestionFilters,
    markAllRead: triage.markAllRead,
    markingAllRead: triage.markingAllRead,
    handlePatchMessage,
    handleAssignedToMeView,
    // AI
    ai,
    refreshAi: fetchAi,
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
    editingQuestion,
    setEditingQuestion,
    handleQuestionUpdated,
    generalSemantic,
    setGeneralSemantic,
    generalTruncated,
    generalSemanticActive: isSemanticQuery(generalSemantic, generalSearch),
    messagesSemantic,
    setMessagesSemantic,
    messagesTruncated,
    messagesSemanticActive: isSemanticQuery(messagesSemantic, messagesSearch),
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
    answerValues,
    setAnswerValues,
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
    handleDeleteMessage,
    handleQuestionCreated,
    handleToggleActive,
    handleDeleteQuestion,
    handleRefreshQuestion,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
