"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, Loader2, Send, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enterToSendWith, enterToSendHint } from "@/lib/enterToSend";
import { PageLoader } from "@/components/Loader";
import AiDraftButton from "@/components/AiDraftButton";
import ThreadView, { type ThreadViewTurn } from "@/components/ThreadView";
import type { AiStatus } from "@/app/dashboard/_components/useDashboardData";
import type { OrgMemberOption } from "@/app/dashboard/_components/useMessageTriage";
import type { LabelView } from "@/lib/labels";
import { MESSAGE_MAX_LABELS } from "@/lib/triageConstants";
import { can } from "@/lib/permissions";
import type { MembershipRole } from "@/models/membership.model";
import { apiError } from "@/lib/apiError";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LABEL_CHIP_BG: Record<string, string> = {
  yellow: "bg-brand-yellow",
  pink: "bg-brand-pink",
  mint: "bg-brand-mint",
  blue: "bg-brand-blue",
};

interface ThreadMessage {
  _id?: string;
  awaitingOrg?: boolean;
  authorType?: "anonymous" | "member";
  archivedAt?: string | null;
  labels?: string[];
  assignedTo?: string | null;
}

// Owner/admin thread view for an anonymous message (the sender's side lives
// at /r/[replyToken] — no session, no account). Only OWNER/ADMIN can reach
// this: the reply GET route 404s for anyone else so existence isn't leaked.
export default function MessageThreadPage() {
  const params = useParams<{ messageId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [message, setMessage] = useState<ThreadMessage | null>(null);
  const [turns, setTurns] = useState<ThreadViewTurn[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [labels, setLabels] = useState<LabelView[]>([]);
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [patching, setPatching] = useState(false);
  const role = session?.user?.activeOrgRole as MembershipRole | undefined;
  const canTriage = can(role, "message:triage") && message?.authorType !== "member";

  const fetchTriageData = useCallback(async () => {
    const orgId = session?.user?.activeOrgId;
    if (!orgId) return;
    try {
      const [l, m] = await Promise.all([
        axios.get(`/api/organizations/${orgId}/labels`),
        axios.get(`/api/organizations/${orgId}/members`),
      ]);
      if (l.data.success) setLabels(l.data.labels);
      if (m.data.success) {
        setMembers(
          (m.data.members as { userId: string; name: string; username: string }[]).map((mm) => ({
            userId: mm.userId,
            name: mm.name,
            username: mm.username,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching label/member data:", error);
    }
  }, [session?.user?.activeOrgId]);

  const patchMessage = async (patch: Record<string, unknown>) => {
    if (!params.messageId) return;
    setPatching(true);
    try {
      const res = await axios.patch(`/api/messages/${params.messageId}`, patch);
      if (res.data.success) {
        setMessage((prev) => (prev ? { ...prev, ...res.data.message } : res.data.message));
      } else {
        toast.error(res.data.message || "Failed to update message");
      }
    } catch (error) {
      toast.error(apiError(error, "Failed to update message"));
    } finally {
      setPatching(false);
    }
  };

  const toggleLabel = (labelId: string) => {
    const has = (message?.labels ?? []).includes(labelId);
    patchMessage({ labels: has ? { remove: [labelId] } : { add: [labelId] } });
  };

  const fetchAi = useCallback(async () => {
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
  }, [session?.user?.activeOrgId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/messages/${params.messageId}/reply`);
      if (res.data.success) {
        setMessage(res.data.message);
        setTurns(res.data.turns);
        setNotFoundState(false);
      } else {
        setNotFoundState(true);
      }
    } catch {
      setNotFoundState(true);
    } finally {
      setLoading(false);
    }
  }, [params.messageId]);

  useEffect(() => {
    // Standard fetch-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAi();
  }, [fetchAi]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTriageData();
  }, [fetchTriageData]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await axios.post(`/api/messages/${params.messageId}/reply`, {
        content: reply.trim(),
      });
      if (res.data.success) {
        setReply("");
        await load();
      } else {
        toast.error(res.data.message || "Failed to send reply");
      }
    } catch (error) {
      const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(msg || "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (notFoundState || !message) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">
          This thread doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Thread</h1>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {canTriage && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={patching}
              onClick={() => patchMessage({ archived: !message.archivedAt })}
            >
              {message.archivedAt ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {message.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            {labels.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setLabelPickerOpen(true)}>
                <Tag className="h-4 w-4" />
                Labels
              </Button>
            )}
            {(message.labels ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {labels
                  .filter((l) => (message.labels ?? []).includes(l._id))
                  .map((l) => (
                    <span
                      key={l._id}
                      className={`inline-flex items-center gap-1 rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide ${LABEL_CHIP_BG[l.color]} text-on-brand`}
                    >
                      {l.name}
                    </span>
                  ))}
              </div>
            )}
            {members.length > 0 && (
              <select
                aria-label="Assign to"
                value={message.assignedTo ?? ""}
                disabled={patching}
                onChange={(e) => patchMessage({ assignedTo: e.target.value || null })}
                className="h-9 rounded-lg border-2 border-ink bg-card px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {message.awaitingOrg && (
          <span className="mb-4 inline-flex items-center gap-1 rounded-md border-2 border-ink bg-brand-yellow px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide text-on-brand">
            Awaiting your reply
          </span>
        )}

        <ThreadView turns={turns} viewerRole="org" />

        <div className="mt-6 space-y-3">
          <AiDraftButton
            messageId={params.messageId}
            currentText={reply}
            onDraft={setReply}
            ai={ai}
            refreshAi={fetchAi}
          />
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={enterToSendWith(handleSend)}
            placeholder="Write a reply the sender will see via their link..."
            className="min-h-[100px] resize-none"
            disabled={sending}
          />
          <p className="text-xs text-muted-foreground">{enterToSendHint}</p>
          <Button onClick={handleSend} disabled={sending || !reply.trim()}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>

      {canTriage && (
        <Dialog open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle>Labels</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              {labels.map((l) => {
                const checked = (message.labels ?? []).includes(l._id);
                const disabled = !checked && (message.labels ?? []).length >= MESSAGE_MAX_LABELS;
                return (
                  <label
                    key={l._id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 ${
                      disabled ? "opacity-50" : "cursor-pointer hover:bg-secondary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleLabel(l._id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span
                      className={`inline-block h-3 w-3 rounded-full border border-ink ${LABEL_CHIP_BG[l.color]}`}
                    />
                    <span className="text-sm">{l.name}</span>
                  </label>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
