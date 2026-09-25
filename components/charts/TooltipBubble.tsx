import type { ReactNode } from "react";

/**
 * Positioned hover/focus tooltip bubble. `left`/`top` are percentages of the
 * chart's SVG viewBox — since the SVG scales uniformly (viewBox + width:
 * 100%), a percentage of viewBox space is always the same percentage of
 * rendered space, so no pixel measurement is needed. `pointer-events-none`
 * so it never steals the hover it's reporting on.
 */
export default function TooltipBubble({
  left,
  top,
  align = "center",
  children,
}: {
  left: number;
  top: number;
  align?: "center" | "left" | "right";
  children: ReactNode;
}) {
  const translateX = align === "center" ? "-50%" : align === "right" ? "-100%" : "0%";
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-max rounded-lg border-2 border-ink bg-card px-2.5 py-1.5 text-xs shadow-solid-sm"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: `translate(${translateX}, -100%) translateY(-8px)`,
      }}
      role="tooltip"
    >
      {children}
    </div>
  );
}
