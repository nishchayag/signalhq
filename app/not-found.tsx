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
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-background px-4">
      <div className="absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute left-1/2 top-1/3 h-64 w-[500px] -translate-x-1/2 rounded-full bg-primary/15 blur-[100px]" />
      <div className="relative mx-auto max-w-md text-center">
        <div className="mb-8">
          <h1 className="text-8xl font-bold tracking-tight text-gradient sm:text-9xl">
            404
          </h1>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Page not found
          </h2>
          <p className="mt-2 text-muted-foreground">
            The page you are looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/"
            className="inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
          >
            Back to home
          </Link>

          <div className="text-sm text-muted-foreground">
            <p>
              Or try{" "}
              <Link href="/signup" className="text-primary hover:underline">
                signing up
              </Link>{" "}
              to start collecting feedback
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
