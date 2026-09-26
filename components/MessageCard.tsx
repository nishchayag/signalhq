"use client";
import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  X,
  Reply as ReplyIcon,
  ShieldAlert,
  EyeOff,
  Mail,
  MailOpen,
  Archive,
  ArchiveRestore,
  Tag,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { MessageView, MessageAiView } from "@/lib/messageView";
import type { LabelView } from "@/lib/labels";
import type { OrgMemberOption } from "@/app/dashboard/_components/useMessageTriage";
import type { PatchMessageRequest } from "@/schemas/triageSchema";
import { MESSAGE_MAX_LABELS } from "@/lib/triageConstants";
import { toast } from "sonner";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { lastTurn, type ThreadSource } from "@/lib/thread";
import { formatAnswer } from "@/lib/answers";

const LABEL_CHIP_BG: Record<string, string> = {
  yellow: "bg-brand-yellow",
  pink: "bg-brand-pink",
  mint: "bg-brand-mint",
  blue: "bg-brand-blue",
};

// Messages at or above this toxicity render collapsed. Only OWNER/ADMIN
// responses carry `toxicity`/`piiFlag` (lib/messageView.ts), so MEMBERs never
// see these treatments.
const TOXICITY_COLLAPSE = 0.85;

const SENTIMENT_CHIP: Record<NonNullable<MessageAiView["sentiment"]>, string> = {
  positive: "bg-brand-mint text-on-brand",
  negative: "bg-brand-pink text-on-brand",
  mixed: "bg-brand-yellow text-on-brand",
  neutral: "bg-card text-foreground",
};

const chip =
  "inline-flex items-center gap-1 rounded-md border-2 border-ink px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide";

function AiChips({ ai }: { ai: MessageAiView }) {
  if (!ai.sentiment && !ai.tags?.length && !ai.piiFlag) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ai.sentiment && (
        <span className={`${chip} ${SENTIMENT_CHIP[ai.sentiment]}`}>{ai.sentiment}</span>
      )}
      {ai.tags?.map((tag) => (
        <span key={tag} className={`${chip} bg-card text-muted-foreground`}>
          {tag.replace(/-/g, " ")}
        </span>
      ))}
      {ai.piiFlag && (
        <span
          className={`${chip} bg-brand-yellow text-on-brand`}
          title="May contain personal details (names, contact info) — review before sharing"
        >
          <ShieldAlert className="h-3 w-3" strokeWidth={2.5} />
          Possible PII
        </span>
      )}
    </div>
  );
}

type TriageableMessage = MessageView & {
  archivedAt?: string | null;
  labels?: string[];
  assignedTo?: string | null;
};

type MessageCardProps = {
  message: MessageView;
  onMessageDelete: (messageId: string) => void;
  canReply: boolean;
  canDelete: boolean;
  /** OWNER/ADMIN-only triage: archive, labels, assign. */
  canTriage?: boolean;
  currentUserId?: string;
  orgLabels?: LabelView[];
  orgMembers?: OrgMemberOption[];
  onPatch?: (messageId: string, patch: PatchMessageRequest) => void;
};

const MessageCard = ({
  message,
  onMessageDelete,
  canReply,
  canDelete,
  canTriage = false,
  currentUserId,
  orgLabels = [],
  orgMembers = [],
  onPatch,
}: MessageCardProps) => {
  const confirm = useConfirm();
  const flagged = (message.ai?.toxicity ?? 0) >= TOXICITY_COLLAPSE;
  const [revealed, setRevealed] = React.useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = React.useState(false);
  const collapsed = flagged && !revealed;
  // Newest turn overall (org reply or the sender's own follow-up), for the
  // card preview. Full history lives at /dashboard/messages/[id].
  const latest = lastTurn(message as unknown as ThreadSource);
  const awaitingOrg = Boolean((message as { awaitingOrg?: boolean }).awaitingOrg);

  const triaged = message as TriageableMessage;
  const isUnread = message.read === false;
  const archived = Boolean(triaged.archivedAt);
  const messageLabelIds = (triaged.labels ?? []).map(String);
  const assignedTo = triaged.assignedTo ? String(triaged.assignedTo) : null;
  const isAssignee = Boolean(currentUserId && assignedTo && assignedTo === currentUserId);
  // The one exception besides message:triage: the current assignee may
  // archive/unarchive their own assigned message (see lib/permissions.ts).
  const canArchiveToggle = canTriage || isAssignee;
  const assignedMember = assignedTo ? orgMembers.find((m) => m.userId === assignedTo) : undefined;
  const messageLabels = orgLabels.filter((l) => messageLabelIds.includes(l._id));

  const toggleRead = () => onPatch?.(message._id as string, { read: !message.read });
  const toggleArchive = () => onPatch?.(message._id as string, { archived: !archived });
  const toggleLabel = (labelId: string) => {
    const has = messageLabelIds.includes(labelId);
    onPatch?.(message._id as string, {
      labels: has ? { remove: [labelId] } : { add: [labelId] },
    });
  };
  const handleAssigneeChange = (value: string) => {
    onPatch?.(message._id as string, { assignedTo: value || null });
  };

  // Runs inside the shared confirm dialog, which stays open with a spinner
  // until the delete settles and shows the server's reason if it fails.
  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this message?",
      description: "It's permanently removed, along with any reply. This can't be undone.",
      confirmLabel: "Delete message",
      destructive: true,
      action: () => axios.post(`/api/deleteMessage`, { messageId: message._id }),
    });
    if (!ok) return;
    toast.success("Message deleted");
    onMessageDelete(message._id as string);
  };

  const createdAt = new Date(message.createdAt);

  // Format time
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(createdAt);

  // Format date
  const date = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(createdAt);

  // Extract timezone abbreviation (e.g. IST)
  const timezone =
    new Intl.DateTimeFormat(undefined, {
      timeZoneName: "shortGeneric",
    })
      .formatToParts(createdAt)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-start">
        <div className="overflow-auto">
          {collapsed ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-ink/50 px-3 py-2">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Flagged as potentially abusive
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRevealed(true)}
              >
                Show
              </Button>
            </div>
          ) : (
            <CardTitle className={`flex items-start gap-2 text-base ${isUnread ? "font-bold" : "font-medium"}`}>
              {isUnread && (
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                  title="Unread"
                />
              )}
              <span className="flex min-w-0 flex-col gap-1">
                {message.answer && (
                  <span className={`${chip} w-fit bg-brand-blue/30 text-foreground`}>
                    {formatAnswer(message.answer)}
                  </span>
                )}
                {message.content && <span>{message.content}</span>}
              </span>
            </CardTitle>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onPatch && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={isUnread ? "Mark as read" : "Mark as unread"}
              title={isUnread ? "Mark as read" : "Mark as unread"}
              onClick={toggleRead}
            >
              {isUnread ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete message"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(message.ai || messageLabels.length > 0 || assignedTo) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {message.ai && <AiChips ai={message.ai} />}
            {messageLabels.map((l) => (
              <span key={l._id} className={`${chip} ${LABEL_CHIP_BG[l.color]} text-on-brand`}>
                <Tag className="h-3 w-3" strokeWidth={2.5} />
                {l.name}
              </span>
            ))}
            {assignedTo && (
              <span className={`${chip} bg-card text-muted-foreground`}>
                Assigned to {assignedMember?.name ?? "Former member"}
              </span>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {`${time}, ${date} (${timezone})\n${formatDistanceToNow(createdAt, {
            addSuffix: true,
          })}`}
        </p>

        {awaitingOrg && (
          <span className={`${chip} bg-brand-yellow text-on-brand`}>Awaiting your reply</span>
        )}

        {latest && (
          <div className="rounded-lg border-2 border-ink bg-card p-3">
            <p className="text-sm text-foreground line-clamp-2 whitespace-pre-line">
              <span className="font-bold">
                {latest.authorRole === "org" ? "You replied" : "They replied"}:
              </span>{" "}
              {latest.content}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canReply && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/messages/${message._id}`}>
                <ReplyIcon className="h-4 w-4" />
                Open thread
              </Link>
            </Button>
          )}

          {onPatch && canArchiveToggle && (
            <Button variant="outline" size="sm" onClick={toggleArchive}>
              {archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {archived ? "Unarchive" : "Archive"}
            </Button>
          )}

          {onPatch && canTriage && orgLabels.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setLabelPickerOpen(true)}>
              <Tag className="h-4 w-4" />
              Labels
            </Button>
          )}

          {onPatch && canTriage && orgMembers.length > 0 && (
            <select
              aria-label="Assign to"
              value={assignedTo ?? ""}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="h-9 rounded-lg border-2 border-ink bg-card px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Unassigned</option>
              {orgMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </CardContent>

      {onPatch && canTriage && (
        <Dialog open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle>Labels</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              {orgLabels.map((l) => {
                const checked = messageLabelIds.includes(l._id);
                const disabled = !checked && messageLabelIds.length >= MESSAGE_MAX_LABELS;
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
              {orgLabels.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No labels yet — create one in organization settings.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};

export default MessageCard;
