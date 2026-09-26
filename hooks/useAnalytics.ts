"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

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

  return { trackEvent };
}
