import React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Branded loader: the logo's yellow bolt chip doing the design system's
 * `.pop` press on a loop (`.animate-pop-press` in globals.css). Use this for
 * page/section loading states; keep plain `Loader2` spinners for inline
 * button states where a bouncing chip would be too loud.
 */
export default function Loader({
  label = "Loading…",
  size = "md",
  className,
}: {
  label?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const chip = size === "sm" ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  const bolt = size === "sm" ? "h-4.5 w-4.5" : "h-6 w-6";
  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("flex flex-col items-center gap-3", className)}
    >
      {/* Bolt stays dark in both themes for contrast on yellow, matching
          the LogoMark; border and shadow follow --ink like everything else. */}
      <span
        className={cn(
          "animate-pop-press flex items-center justify-center border-2 border-ink bg-brand-yellow text-[#1d100b]",
          chip
        )}
      >
        <Zap className={cn("fill-current", bolt)} strokeWidth={2} />
      </span>
      {label && (
        <span className="text-sm font-semibold text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}

/** Full-height centered loader for whole-page loading states. */
export function PageLoader({ label }: { label?: string | null }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
      <Loader label={label} />
    </div>
  );
}
