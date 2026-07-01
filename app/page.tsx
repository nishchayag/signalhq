import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Mail,
  ArrowRight,
  Check,
  Lock,
} from "lucide-react";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import FAQSection from "@/components/FAQSection";

/* A faux product window — built in CSS so it adapts to light/dark. */
function ProductPreview() {
  return (
    <div className="mx-auto mt-16 max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-400/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
          <div className="mx-auto rounded-md bg-background px-3 py-1 text-xs text-muted-foreground">
            signalhq.io/o/acme
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
          {/* mini sidebar */}
          <div className="hidden border-r border-border p-4 sm:block">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="h-5 w-5 rounded-md bg-gradient-to-br from-primary to-fuchsia-500" />
              <span className="text-sm font-medium text-foreground">
                Acme Inc.
              </span>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                General messages
              </div>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                What should we build next?
              </div>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                How&apos;s the new release?
              </div>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Team retro
              </div>
            </div>
          </div>
          {/* feed */}
          <div className="space-y-3 p-5">
            {[
              "The onboarding flow is genuinely the best I've used.",
              "Standups could be 15 minutes shorter — we drift.",
              "Loved the offsite. More cross-team pairing please.",
            ].map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Anonymous · just now
                  </span>
                </div>
                <p className="text-sm text-foreground">{m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.4] [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="absolute left-1/2 top-[-15%] -z-0 h-[460px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Anonymous feedback for modern teams
          </span>
          <h1 className="mx-auto mt-8 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            Hear the signal.
            <br />
            <span className="text-muted-foreground">Not the noise.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            SignalHQ collects candid, anonymous feedback through shareable links
            — organized by organization, team, and question. So you finally hear
            what people really think.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Start for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-medium text-foreground transition hover:text-primary"
            >
              Log in
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Free to start · No credit card · Always anonymous for responders
          </p>

          <ProductPreview />
        </div>
      </section>

      {/* Stat / value strip */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px sm:grid-cols-3">
          {[
            ["100%", "Anonymous for everyone who responds"],
            ["1 link", "To collect feedback for a whole org"],
            ["Teams", "Scoped questions, roles & invites built in"],
          ].map(([big, small]) => (
            <div key={big} className="bg-background px-8 py-10 text-center">
              <div className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {big}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bento features */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Built to hear the truth.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Everything you need to collect honest feedback and turn it into
            something your team can act on.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3 md:grid-rows-2">
          {/* Big anonymity card */}
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:col-span-2 md:row-span-2">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h3 className="mt-6 text-2xl font-semibold tracking-tight">
              Anonymous by design
            </h3>
            <p className="mt-3 max-w-md text-muted-foreground">
              No accounts, no tracking, no way to trace a message back to its
              sender. People tell you what they actually think — and you get
              feedback you can trust.
            </p>
            <div className="mt-8 space-y-2.5">
              {[
                "Responders never sign in or reveal who they are",
                "Every message lands in a private, organized inbox",
                "You stay in control of who on your team can read it",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-3 text-sm text-foreground"
                >
                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <Users className="h-7 w-7 text-primary" />
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              Teams & roles
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Scope questions to teams and keep control with owner, admin, and
              member roles.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <Mail className="h-7 w-7 text-primary" />
            <h3 className="mt-5 text-xl font-semibold tracking-tight">
              Effortless invites
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Bring your whole org in with a single email — works for new and
              existing accounts alike.
            </p>
          </div>
        </div>
      </section>

      {/* Large feature row */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-28 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-primary">
              One link, everywhere
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Share a link. Get the truth back.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Drop your organization link — or a question-specific one — into
              Slack, an email, your site, or a deck. Anyone can respond in
              seconds, no login required.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 text-base font-medium text-primary hover:underline"
            >
              Create your link
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-foreground">
              Send anonymous feedback to Acme Inc.
            </p>
            <div className="mt-3 rounded-lg border border-input bg-background p-4 text-sm text-muted-foreground">
              The new dashboard is so much faster. Whatever you changed, keep
              going.
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Anonymous &amp; private
              </span>
              <span className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground">
                Send
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-5xl">
          From sign-up to signal in a minute.
        </h2>
        <div className="mt-16 grid gap-12 md:grid-cols-3">
          {[
            [
              "01",
              "Create your organization",
              "Sign up and get a personal org instantly. Add teams and invite people whenever you're ready.",
            ],
            [
              "02",
              "Share your link",
              "Post your org or question link anywhere you want honest input — responders never need an account.",
            ],
            [
              "03",
              "Read the signal",
              "Anonymous responses flow into your dashboard, neatly organized by team and question.",
            ],
          ].map(([n, title, body]) => (
            <div key={n}>
              <div className="text-sm font-semibold tracking-widest text-primary">
                {n}
              </div>
              <div className="mt-4 h-px w-full bg-border" />
              <h3 className="mt-5 text-xl font-semibold tracking-tight">
                {title}
              </h3>
              <p className="mt-2 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <TestimonialsCarousel />
      <FAQSection />

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-20 text-center">
          <div className="absolute left-1/2 top-0 h-72 w-[700px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
          <h2 className="relative text-4xl font-semibold tracking-tight sm:text-6xl">
            Ready to hear the truth?
          </h2>
          <p className="relative mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Set up SignalHQ in under a minute. It&apos;s free to start, and every
            response stays anonymous.
          </p>
          <Link
            href="/signup"
            className="relative mt-9 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-medium text-primary-foreground transition hover:opacity-90"
          >
            Start for free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
