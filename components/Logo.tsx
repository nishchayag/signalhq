import React from "react";

/**
 * The SignalHQ mark: a brand-yellow chip with the neobrutalist treatment
 * (2px ink border, hard offset shadow) around a solid lightning bolt.
 * Border and shadow follow --ink so they flip with the theme like every
 * other bordered element; the bolt stays dark for contrast on yellow.
 *
 * app/icon.svg, favicon.ico, apple-icon.png and public/icon-*.png are
 * rasterized from this same artwork (light-mode colors hardcoded) — keep
 * them in sync when changing the mark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="10" y="10" width="50" height="50" rx="14" fill="var(--ink)" />
      <rect
        x="4"
        y="4"
        width="50"
        height="50"
        rx="14"
        fill="var(--brand-yellow)"
        stroke="var(--ink)"
        strokeWidth="4"
      />
      <path
        transform="translate(7.4 7.4) scale(1.8)"
        fill="#1d100b"
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </svg>
  );
}

export default function Logo({ markClassName }: { markClassName?: string }) {
  return (
    <>
      <LogoMark className={markClassName ?? "h-10 w-10"} />
      <span className="text-xl font-black tracking-tight text-foreground">
        Signal<span className="text-primary">HQ</span>
      </span>
    </>
  );
}
