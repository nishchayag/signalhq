import { after } from "next/server";

/**
 * Run `task` after the response is sent. Uses next/server's `after()` inside
 * a request; outside one (Vitest, scripts, cron helpers called directly)
 * `after` throws, so fall back to a detached promise. Never throws, and a
 * failing task only logs its error name — task errors may carry user content.
 */
export function runAfter(task: () => Promise<unknown>): void {
  const safe = () =>
    Promise.resolve()
      .then(task)
      .catch((err: unknown) => {
        const name =
          typeof err === "object" && err !== null && typeof (err as { name?: unknown }).name === "string"
            ? (err as { name: string }).name
            : typeof err;
        console.error(`[background] task failed: ${name.slice(0, 60)}`);
      });
  try {
    after(safe);
  } catch {
    void safe();
  }
}
