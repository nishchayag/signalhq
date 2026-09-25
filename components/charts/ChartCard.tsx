import type { ReactNode } from "react";

/**
 * Card chrome shared by every chart: title row (+ optional legend/action
 * slot on the right) and a content area. Matches the app's neobrutalist card
 * treatment (border-2 border-ink, shadow-solid-sm) rather than a thin
 * shadcn card.
 */
export default function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-card p-4 shadow-solid-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
