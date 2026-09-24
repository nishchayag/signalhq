import { Building2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ThreadEntryAuthorRole } from "@/models/message.model";

export interface ThreadViewTurn {
  authorRole: ThreadEntryAuthorRole;
  content: string;
  createdAt: string | Date;
}

const ROLE_CARD_STYLE: Record<ThreadEntryAuthorRole, string> = {
  sender: "bg-brand-blue/20",
  member: "bg-brand-blue/20",
  org: "bg-brand-mint/25",
};

const ROLE_ICON: Record<ThreadEntryAuthorRole, typeof User> = {
  sender: User,
  member: User,
  org: Building2,
};

const DEFAULT_LABEL: Record<ThreadEntryAuthorRole, string> = {
  member: "Member",
  sender: "Sender",
  org: "Org reply",
};

export interface ThreadViewProps {
  turns: ThreadViewTurn[];
  /** The authorRole that is "you" from the current viewer's perspective —
   * those turns get "You" instead of the role's default label. Omit to use
   * the default label for every turn (e.g. an oversight viewer who isn't a
   * party to the thread). */
  viewerRole?: ThreadEntryAuthorRole;
  /** Override a role's default label (e.g. "They replied" for `org` on the
   * anonymous sender's own receipt page). */
  roleLabels?: Partial<Record<ThreadEntryAuthorRole, string>>;
  className?: string;
}

/**
 * A message's whole conversation as ordered, role-colored turn cards —
 * shared by the member-thread page, the owner's anonymous-message thread
 * page, and the sender's /r receipt page. Renders plain text only
 * (whitespace-pre-line, no HTML/markdown interpretation).
 */
export default function ThreadView({ turns, viewerRole, roleLabels, className }: ThreadViewProps) {
  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {turns.map((turn, i) => {
        const Icon = ROLE_ICON[turn.authorRole];
        const label =
          turn.authorRole === viewerRole
            ? "You"
            : roleLabels?.[turn.authorRole] ?? DEFAULT_LABEL[turn.authorRole];
        return (
          <div
            key={i}
            className={`rounded-2xl border-2 border-ink p-4 shadow-solid-sm ${ROLE_CARD_STYLE[turn.authorRole]}`}
          >
            <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
              {label}
              <span className="font-normal normal-case">
                · {formatDistanceToNow(new Date(turn.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="whitespace-pre-line text-sm text-foreground">{turn.content}</p>
          </div>
        );
      })}
    </div>
  );
}
