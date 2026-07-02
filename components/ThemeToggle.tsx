"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark switcher. Renders a stable placeholder until mounted to avoid a
 * hydration mismatch (the resolved theme is only known on the client).
 */
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // One-time hydration-safety flag, not a cascading update — no external
  // system to subscribe to instead.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-ink bg-card text-foreground pop ${className}`}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-[1.1rem] w-[1.1rem]" />
        ) : (
          <Moon className="h-[1.1rem] w-[1.1rem]" />
        )
      ) : (
        <Sun className="h-[1.1rem] w-[1.1rem] opacity-0" />
      )}
    </button>
  );
}
