import Link from "next/link";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "404 - Page Not Found",
  description:
    "The page you are looking for could not be found. Return to SignalHQ to continue collecting anonymous feedback.",
  noindex: true,
});

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-dot-grid px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border-2 border-ink bg-card p-8 text-center shadow-solid-lg">
        <span className="mx-auto inline-flex rounded-xl border-2 border-ink bg-brand-yellow px-4 py-1 text-5xl font-black tracking-tight text-on-brand shadow-solid-sm">
          404
        </span>
        <h1 className="mt-6 text-2xl font-black tracking-tight text-foreground">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border-2 border-ink bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground pop"
          >
            Back to home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border-2 border-ink bg-card px-6 py-2.5 text-sm font-bold text-foreground pop"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
