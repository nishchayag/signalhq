// Pure, DOM-free helpers for the embed auto-resize postMessage protocol
// (components/EmbedAutoResize.tsx). Kept separate from the component so the
// message shape and the rounding/growth rules can be unit-tested without a
// DOM: see embedResize.test.ts.

export const RESIZE_MESSAGE_TYPE = "signalhq:resize" as const;

export interface ResizeMessage {
  type: typeof RESIZE_MESSAGE_TYPE;
  height: number;
}

const STEP = 40;

/** Rounds a non-negative height up to the next `step`px boundary, so minor
 * content reflow (a focus ring, a toast animating) doesn't post a new
 * message on every pixel of jitter. */
export function roundUpToStep(height: number, step: number = STEP): number {
  const safe = Math.max(0, height);
  return Math.ceil(safe / step) * step;
}

/**
 * The next height to report to the host page, given the last one reported.
 * Only ever grows: a transient collapse (e.g. a toast leaving, a field
 * clearing) never shrinks the iframe, so the reported height can't be used
 * by the host page to infer anything about in-page state/timing (e.g. when
 * a submit happened) from a height *decrease*.
 */
export function nextReportedHeight(previousHeight: number, measuredHeight: number): number {
  const rounded = roundUpToStep(measuredHeight);
  return Math.max(previousHeight, rounded);
}

/** The exact (and only) message shape EmbedAutoResize ever posts. Carries
 * nothing but a type tag and a height — no reply token, URL or content ever
 * belongs here. */
export function buildResizeMessage(height: number): ResizeMessage {
  return { type: RESIZE_MESSAGE_TYPE, height };
}
