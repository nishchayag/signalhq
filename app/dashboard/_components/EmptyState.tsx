import type { LucideIcon } from "lucide-react";

/** Dashed "nothing here yet" panel used across the dashboard views. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 border-dashed border-ink/40 text-center ${
        compact ? "rounded-xl py-10" : "py-16"
      }`}
    >
      <Icon
        className={`mx-auto text-muted-foreground/40 ${compact ? "mb-3 h-10 w-10" : "mb-4 h-12 w-12"}`}
      />
      <h3 className={`font-bold text-foreground ${compact ? "text-sm" : "mb-1 text-lg"}`}>{title}</h3>
      {description && (
        <p className={compact ? "text-xs text-muted-foreground" : "text-muted-foreground"}>{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
