"use client";
import { useCallback, useSyncExternalStore } from "react";

// Same-tab writes don't fire the "storage" event, so flags broadcast their
// own event to keep every reader (e.g. the checklist and the link card) in sync.
const LOCAL_EVENT = "signalhq:local-flag";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false; // storage blocked (private mode etc.) — treat as unset
  }
}

/**
 * A per-browser boolean backed by localStorage, read through
 * useSyncExternalStore so it's hydration-safe (server snapshot is `false`)
 * without a set-state-in-effect. Returns [value, setTrue].
 */
export function useLocalFlag(key: string | null): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : false),
    () => false
  );
  const set = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* ignore — the flag just won't persist */
    }
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, [key]);
  return [value, set];
}
