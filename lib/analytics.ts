"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

/** The funnel events we care about. Keep this list short and meaningful. */
export type AnalyticsEvent =
  | "signup_completed"
  | "question_created"
  | "link_copied"
  | "feedback_sent"
  | "guard_used"
  | "qr_downloaded"
  | "branding_saved"
  | "logo_uploaded";

/**
 * Fire a custom analytics event (Google Analytics + Microsoft Clarity, when
 * their IDs are configured — see app/layout.tsx). A plain function, not a
 * hook, so any handler can call it without re-running pageview config.
 *
 * Never pass message content, names, emails or ids in `label`: this is an
 * anonymous-feedback product, and analytics must not be able to tie a
 * response to anyone. Labels are coarse categories only ("org", "question").
 */
export function trackEvent(action: AnalyticsEvent, label?: string) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", action, { event_category: "engagement", event_label: label });
    window.clarity?.("event", action);
  } catch {
    // analytics must never break the product
  }
}
