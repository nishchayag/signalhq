"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { can } from "@/lib/permissions";
import type { MembershipRole } from "@/models/membership.model";
import type { LabelView } from "@/lib/labels";
import type { MessageView } from "@/lib/messageView";
import type { PatchMessageRequest } from "@/schemas/triageSchema";
import { apiError } from "@/lib/apiError";
import {
  DEFAULT_TRIAGE_FILTERS,
  triageFiltersToParams,
  type TriageFilters,
} from "@/lib/triageFilters";

export interface OrgMemberOption {
  userId: string;
  name: string;
  username: string;
}

export interface MessageCounts {
  general: { unread: number };
  questions: Record<string, number>;
  assignedToMe: number;
}

const EMPTY_COUNTS: MessageCounts = { general: { unread: 0 }, questions: {}, assignedToMe: 0 };

type PatchableFields = {
  read?: boolean;
  archivedAt?: string | null;
  labels?: string[];
  assignedTo?: string | null;
};

/**
 * Optimistic merge of a PATCH body onto a list entry (see patchMessage).
 * MessageView types archivedAt/labels/assignedTo as the Mongoose (Date /
 * ObjectId) shapes, but a list response has already serialized them to
 * strings over the wire — the loose intermediate type here matches what's
 * actually on the object at runtime, not IMessage's server-side types.
 */
function mergePatch(entry: MessageView, patch: PatchMessageRequest): MessageView {
  const next = { ...entry } as unknown as PatchableFields & Record<string, unknown>;
  if (patch.read !== undefined) next.read = patch.read;
  if (patch.archived !== undefined) {
    next.archivedAt = patch.archived ? new Date().toISOString() : null;
  }
  if (patch.labels) {
    const current = new Set(((entry as unknown as PatchableFields).labels ?? []).map(String));
    for (const id of patch.labels.add ?? []) current.add(id);
    for (const id of patch.labels.remove ?? []) current.delete(id);
    next.labels = [...current];
  }
  if (patch.assignedTo !== undefined) next.assignedTo = patch.assignedTo;
  return next as unknown as MessageView;
}

/**
 * Per-org triage data (labels, members, badge counts) plus per-list filter
 * state for the general list and the currently selected question's list.
 * useDashboardData wires this in: it reads `generalParams`/`questionParams`
 * when building getMessages/questions/[id] requests, and refetches (via
 * `onFiltersChange`) whenever a filter setter here is called — never
 * debounced.
 *
 * `generalFiltersRef`/`questionFiltersRef` mirror the state the same way
 * useDashboardData's own semantic-search refs do (see generalSemanticRef):
 * the param builders read the ref, which is updated synchronously, so a
 * reset immediately followed by a fetch in the same tick (org switch) can't
 * race a batched state update.
 */
export function useMessageTriage(opts: {
  orgId?: string;
  role?: MembershipRole;
  onFiltersChange: (which: "general" | "question") => void;
}) {
  const { orgId, role, onFiltersChange } = opts;
  const canTriage = can(role, "message:triage");
  const canManageLabels = can(role, "org:labels");

  const [generalFilters, setGeneralFiltersState] = useState<TriageFilters>(DEFAULT_TRIAGE_FILTERS);
  const [questionFilters, setQuestionFiltersState] = useState<TriageFilters>(DEFAULT_TRIAGE_FILTERS);
  const generalFiltersRef = useRef<TriageFilters>(DEFAULT_TRIAGE_FILTERS);
  const questionFiltersRef = useRef<TriageFilters>(DEFAULT_TRIAGE_FILTERS);
  const [labels, setLabels] = useState<LabelView[]>([]);
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [counts, setCounts] = useState<MessageCounts>(EMPTY_COUNTS);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const setGeneralFilters = useCallback(
    (next: Partial<TriageFilters>) => {
      generalFiltersRef.current = { ...generalFiltersRef.current, ...next };
      setGeneralFiltersState(generalFiltersRef.current);
      onFiltersChange("general");
    },
    [onFiltersChange]
  );

  const setQuestionFilters = useCallback(
    (next: Partial<TriageFilters>) => {
      questionFiltersRef.current = { ...questionFiltersRef.current, ...next };
      setQuestionFiltersState(questionFiltersRef.current);
      onFiltersChange("question");
    },
    [onFiltersChange]
  );

  /** Fresh filters for a newly selected question — no fetch (the caller is
   * about to fetch that question's messages anyway). */
  const resetQuestionFilters = useCallback(() => {
    questionFiltersRef.current = DEFAULT_TRIAGE_FILTERS;
    setQuestionFiltersState(DEFAULT_TRIAGE_FILTERS);
  }, []);

  /** Reset both lists' filters synchronously, with no fetch of its own —
   * for the org-switch effect, which fetches right after. */
  const resetForNewOrg = useCallback(() => {
    generalFiltersRef.current = DEFAULT_TRIAGE_FILTERS;
    questionFiltersRef.current = DEFAULT_TRIAGE_FILTERS;
    setGeneralFiltersState(DEFAULT_TRIAGE_FILTERS);
    setQuestionFiltersState(DEFAULT_TRIAGE_FILTERS);
  }, []);

  const generalParams = useCallback(() => triageFiltersToParams(generalFiltersRef.current), []);
  const questionParams = useCallback(() => triageFiltersToParams(questionFiltersRef.current), []);

  const fetchCounts = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await axios.get("/api/messages/counts");
      if (res.data.success) {
        setCounts({
          general: res.data.general,
          questions: res.data.questions,
          assignedToMe: res.data.assignedToMe,
        });
      }
    } catch (error) {
      console.error("Error fetching message counts:", error);
    }
  }, [orgId]);

  const fetchLabels = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/labels`);
      if (res.data.success) setLabels(res.data.labels);
    } catch (error) {
      console.error("Error fetching labels:", error);
    }
  }, [orgId]);

  const fetchMembers = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await axios.get(`/api/organizations/${orgId}/members`);
      if (res.data.success) {
        setMembers(
          (res.data.members as { userId: string; name: string; username: string }[]).map((m) => ({
            userId: m.userId,
            name: m.name,
            username: m.username,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching org members:", error);
    }
  }, [orgId]);

  // Org-scoped data, loaded once per org (and whenever the org changes).
  const loadedOrgRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId || loadedOrgRef.current === orgId) return;
    loadedOrgRef.current = orgId;
    setLabels([]);
    setMembers([]);
    setCounts(EMPTY_COUNTS);
    fetchCounts();
    fetchLabels();
    fetchMembers();
  }, [orgId, fetchCounts, fetchLabels, fetchMembers]);

  /**
   * Optimistic single-message PATCH (pattern: handleDeleteMessage). `setList`
   * is the list's setState (generalMessages/messages); `shouldRemove` — set
   * by the caller, which knows the active status filter — drops the message
   * from an "open" list on archive (or from "archived" on unarchive) instead
   * of just updating its fields in place.
   */
  const patchMessage = useCallback(
    async (
      messageId: string,
      patch: PatchMessageRequest,
      setList: (updater: (prev: MessageView[]) => MessageView[]) => void,
      shouldRemove: boolean
    ) => {
      let previous: MessageView | undefined;
      let previousIndex = -1;
      setList((prev) => {
        const idx = prev.findIndex((m) => String(m._id) === messageId);
        if (idx === -1) return prev;
        previous = prev[idx];
        previousIndex = idx;
        if (shouldRemove) return prev.filter((_, i) => i !== idx);
        const next = [...prev];
        next[idx] = mergePatch(prev[idx], patch);
        return next;
      });
      try {
        const res = await axios.patch(`/api/messages/${messageId}`, patch);
        if (!res.data.success) throw new Error(res.data.message || "Failed to update message");
        if (!shouldRemove) {
          setList((prev) =>
            prev.map((m) => (String(m._id) === messageId ? (res.data.message as MessageView) : m))
          );
        }
        fetchCounts();
        return true;
      } catch (error) {
        setList((prev) => {
          if (!previous) return prev;
          if (shouldRemove) {
            const next = [...prev];
            next.splice(Math.min(previousIndex, next.length), 0, previous);
            return next;
          }
          return prev.map((m) => (String(m._id) === messageId ? (previous as MessageView) : m));
        });
        toast.error(apiError(error, "Failed to update message"));
        return false;
      }
    },
    [fetchCounts]
  );

  const markAllRead = useCallback(
    async (scope: { general: true } | { questionId: string }) => {
      setMarkingAllRead(true);
      try {
        let hasMore = true;
        while (hasMore) {
          const res = await axios.post("/api/messages/bulk", { scope, action: "markAllRead" });
          if (!res.data.success) throw new Error(res.data.message);
          hasMore = Boolean(res.data.hasMore);
        }
        toast.success("Marked all as read");
        fetchCounts();
        return true;
      } catch (error) {
        console.error("Error marking all read:", error);
        toast.error(apiError(error, "Failed to mark all as read"));
        return false;
      } finally {
        setMarkingAllRead(false);
      }
    },
    [fetchCounts]
  );

  return {
    canTriage,
    canManageLabels,
    generalFilters,
    setGeneralFilters,
    questionFilters,
    setQuestionFilters,
    resetQuestionFilters,
    resetForNewOrg,
    generalParams,
    questionParams,
    labels,
    refreshLabels: fetchLabels,
    members,
    counts,
    fetchCounts,
    patchMessage,
    markAllRead,
    markingAllRead,
  };
}

export type MessageTriage = ReturnType<typeof useMessageTriage>;
