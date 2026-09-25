"use client";
import { Loader2, X } from "lucide-react";
import type { LabelView } from "@/lib/labels";
import type { OrgMemberOption } from "@/app/dashboard/_components/useMessageTriage";
import type { TriageFilters } from "@/lib/triageFilters";

const STATUS_OPTIONS: { value: TriageFilters["status"]; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

const selectClass =
  "h-9 rounded-lg border-2 border-ink bg-card px-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Compact filter row for a message list: status segmented control, an
 * unread toggle, a label select and an assignee select, plus "Mark all
 * read". Shared by GeneralMessagesView and QuestionView's public list.
 * Wraps cleanly at phone width (390px) via flex-wrap.
 */
export default function MessageFilters({
  filters,
  onChange,
  labels,
  members,
  onMarkAllRead,
  markingAllRead,
}: {
  filters: TriageFilters;
  onChange: (next: Partial<TriageFilters>) => void;
  labels: LabelView[];
  members: OrgMemberOption[];
  onMarkAllRead: () => void;
  markingAllRead: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border-2 border-ink">
        {STATUS_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={filters.status === opt.value}
            onClick={() => onChange({ status: opt.value })}
            className={`h-9 px-3 text-sm font-bold transition-colors ${
              i > 0 ? "border-l-2 border-ink" : ""
            } ${
              filters.status === opt.value
                ? "bg-brand-yellow text-on-brand"
                : "bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={filters.unread}
        onClick={() => onChange({ unread: !filters.unread })}
        className={`pop h-9 rounded-lg border-2 border-ink px-3 text-sm font-bold ${
          filters.unread ? "bg-brand-yellow text-on-brand" : "bg-card text-foreground"
        }`}
      >
        Unread
      </button>

      {labels.length > 0 && (
        <select
          aria-label="Filter by label"
          value={filters.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className={selectClass}
        >
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l._id} value={l._id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {members.length > 0 && (
        <select
          aria-label="Filter by assignee"
          value={filters.assignee}
          onChange={(e) => onChange({ assignee: e.target.value })}
          className={selectClass}
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      )}

      {(filters.score || filters.choice) && (
        <button
          type="button"
          onClick={() => onChange({ score: "", choice: "" })}
          className="pop flex h-9 items-center gap-1.5 rounded-lg border-2 border-ink bg-brand-blue/30 px-3 text-sm font-bold text-foreground"
        >
          Answer filter: {filters.score ? `score ${filters.score}` : "choice"}
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onMarkAllRead}
        disabled={markingAllRead}
        className="h-9 rounded-lg border-2 border-ink bg-card px-3 text-sm font-bold text-foreground hover:bg-secondary disabled:opacity-60"
      >
        {markingAllRead ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Mark all read"
        )}
      </button>
    </div>
  );
}
