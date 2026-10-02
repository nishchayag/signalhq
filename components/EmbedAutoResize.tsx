"use client";
import { useEffect, useRef } from "react";
import { buildResizeMessage, nextReportedHeight } from "@/lib/embedResize";

/**
 * Reports this embed page's content height to the parent frame so
 * public/embed.js can grow the iframe to fit — otherwise the page would be
 * stuck at whatever fixed height the embedding site's `<script>` snippet
 * guessed. Renders nothing itself.
 *
 * Deliberately narrow, on purpose:
 * - Posts only `{type:"signalhq:resize", height}` (lib/embedResize.ts) — no
 *   reply token, receipt URL or page content is ever included; the height
 *   isn't secret, so `targetOrigin` is `"*"`.
 * - The height only grows (rounded up to 40px steps), so it can't be used
 *   by the host page to infer in-page timing (e.g. correlating a height
 *   drop with a submit).
 * - Never adds a `message` listener — an embed frame has nothing to react
 *   to from its host, and listening would just be an unused attack surface.
 */
export default function EmbedAutoResize() {
  const lastHeight = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;

    const report = () => {
      const measured = document.documentElement.scrollHeight;
      const next = nextReportedHeight(lastHeight.current, measured);
      if (next !== lastHeight.current) {
        lastHeight.current = next;
        window.parent.postMessage(buildResizeMessage(next), "*");
      }
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    window.addEventListener("load", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("load", report);
    };
  }, []);

  return null;
}
