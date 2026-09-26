"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Measures a container's real pixel width via ResizeObserver. Charts use
 * this instead of a fixed abstract `viewBox` width so 1 SVG unit == 1 real
 * pixel: only the width scales with the container (bars widen), while a
 * fixed-pixel height and font-size stay crisp at every breakpoint — a
 * viewBox locked to e.g. 600 units would shrink 10px text to ~6px at a
 * 390px phone width once card padding is subtracted.
 */
export function useContainerWidth(defaultWidth = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
