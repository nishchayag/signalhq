"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    clarity: (...args: unknown[]) => void;
  }
}

export function useAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Google Analytics
      if (window.gtag) {
        window.gtag("config", process.env.NEXT_PUBLIC_GA_ID, {
          page_path: pathname,
        });
      }

      // Microsoft Clarity
      if (window.clarity) {
        window.clarity("set", "page_path", pathname);
      }
    }
  }, [pathname]);

  const trackEvent = (
    action: string,
    category: string,
    label?: string,
    value?: number
  ) => {
    if (typeof window !== "undefined") {
      // Google Analytics
      if (window.gtag) {
        window.gtag("event", action, {
          event_category: category,
          event_label: label,
          value: value,
        });
      }

      // Microsoft Clarity (custom event)
      if (window.clarity) {
        window.clarity("event", action);
      }
    }
  };

  return { trackEvent };
}
