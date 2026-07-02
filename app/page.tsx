import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Mail,
  ArrowRight,
  Check,
  Lock,
  Sparkles,
  MessagesSquare,
} from "lucide-react";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import FAQSection from "@/components/FAQSection";

const stats: [string, string, string][] = [
  ["100%", "Anonymous for everyone who responds", "bg-brand-yellow"],
  ["1 link", "To collect feedback for a whole org", "bg-brand-mint"],
  ["Teams", "Scoped questions, roles & invites built in", "bg-brand-blue"],
];

const features: {
  icon: React.ReactNode;
  chip: string;
  title: string;
  body: string;
  big?: boolean;
}[] = [
  {
    icon: <ShieldCheck className="h-7 w-7" strokeWidth={2.25} />,
    chip: "bg-brand-yellow",
    title: "Anonymous by design",
    body: "No accounts, no tracking, no way to trace a message back to its sender. People tell you what they actually think.",
    big: true,
  },
  {
    icon: <Users className="h-6 w-6" strokeWidth={2.25} />,
    chip: "bg-brand-mint",
    title: "Teams & roles",
    body: "Scope questions to teams and keep control with owner, admin, and member roles.",
  },
  {
    icon: <Mail className="h-6 w-6" strokeWidth={2.25} />,
    chip: "bg-brand-blue",
    title: "Effortless invites",
    body: "Bring your whole org in with a single email — works for new and existing accounts alike.",
  },
];

function ProductPreview() {
  return (
    <div className="mx-auto mt-16 max-w-5xl rotate-[-0.4deg]">
      <div className="overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-solid-lg">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b-2 border-ink bg-brand-yellow px-4 py-3">
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-brand-pink" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-brand-blue" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-brand-mint" />
          <div className="mx-auto rounded-md border-2 border-ink bg-card px-3 py-1 text-xs font-semibold text-foreground">
            signalhq.io/o/acme
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
          {/* mini sidebar */}
          <div className="hidden border-r-2 border-ink p-4 sm:block">
            <div className="flex items-center gap-2 rounded-lg border-2 border-ink bg-brand-blue px-3 py-2">
              <span className="h-5 w-5 rounded-md border-2 border-ink bg-card" />
              <span className="text-sm font-bold text-ink">Acme Inc.</span>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="rounded-lg border-2 border-ink bg-accent px-3 py-2 text-xs font-bold text-accent-foreground">
                General messages
              </div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                What should we build next?
              </div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                How&apos;s the new release?
              </div>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
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
                className="rounded-xl border-2 border-ink bg-background p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-card text-ink">
                    <Lock className="h-3 w-3" />
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Anonymous · just now
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{m}</p>
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
      <section className="relative overflow-hidden border-b-2 border-ink bg-dot-grid">
        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-4 py-1.5 text-sm font-bold text-foreground shadow-solid-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Anonymous feedback for modern teams
          </span>
          <h1 className="mx-auto mt-8 max-w-4xl text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
            Hear what they
            <br />
            <span className="highlight">won&apos;t say to your face.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            SignalHQ collects candid, anonymous feedback through shareable
            links — organized by organization, team, and question. So you
            finally hear what people really think.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground pop"
            >
              Start for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border-2 border-ink bg-card px-7 py-3.5 text-base font-bold text-foreground pop"
            >
              Log in
            </Link>
          </div>
          <p className="mt-6 text-sm font-medium text-muted-foreground">
            Free to start · No credit card · Always anonymous for responders
          </p>

          <ProductPreview />
        </div>
      </section>

      {/* Stat / value strip */}
      <section className="border-b-2 border-ink bg-background">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-16 sm:grid-cols-3">
          {stats.map(([big, small, chip]) => (
            <div
              key={big}
              className={`rounded-2xl border-2 border-ink px-8 py-10 text-center shadow-solid ${chip}`}
            >
              <div className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
                {big}
              </div>
              <p className="mt-2 text-sm font-semibold text-ink/80">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bento features */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
            Built to hear the truth.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Everything you need to collect honest feedback and turn it into
            something your team can act on.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:grid-rows-2">
          {/* Big anonymity card */}
          <div className="rounded-2xl border-2 border-ink bg-card p-8 shadow-solid md:col-span-2 md:row-span-2">
            <span
              className={`inline-flex h-14 w-14 items-center justify-center rounded-xl border-2 border-ink ${features[0].chip} text-ink`}
            >
              {features[0].icon}
            </span>
            <h3 className="mt-6 text-2xl font-black tracking-tight">
              {features[0].title}
            </h3>
            <p className="mt-3 max-w-md text-muted-foreground">
              {features[0].body}
            </p>
            <div className="mt-8 space-y-2.5">
              {[
                "Responders never sign in or reveal who they are",
                "Every message lands in a private, organized inbox",
                "You stay in control of who on your team can read it",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-3 text-sm font-medium text-foreground"
                >
                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                  {t}
                </div>
              ))}
            </div>
          </div>

          {features.slice(1).map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border-2 border-ink bg-card p-8 shadow-solid"
            >
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink ${f.chip} text-ink`}
              >
                {f.icon}
              </span>
              <h3 className="mt-5 text-xl font-black tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Large feature row */}
      <section className="border-y-2 border-ink bg-secondary">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-28 md:grid-cols-2">
          <div>
            <p className="inline-flex rounded-full border-2 border-ink bg-brand-pink px-3 py-1 text-sm font-bold text-ink">
              One link, everywhere
            </p>
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
              Share a link. Get the truth back.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Drop your organization link — or a question-specific one — into
              Slack, an email, your site, or a deck. Anyone can respond in
              seconds, no login required.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-card px-5 py-2.5 text-base font-bold text-foreground pop"
            >
              Create your link
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-2xl border-2 border-ink bg-card p-6 shadow-solid">
            <p className="text-sm font-bold text-foreground">
              Send anonymous feedback to Acme Inc.
            </p>
            <div className="mt-3 rounded-lg border-2 border-ink bg-background p-4 text-sm font-medium text-foreground">
              The new dashboard is so much faster. Whatever you changed, keep
              going.
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Anonymous &amp; private
              </span>
              <span className="rounded-lg border-2 border-ink bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">
                Send
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <h2 className="text-center text-3xl font-black tracking-tight sm:text-5xl">
          From sign-up to signal in a minute.
        </h2>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            [
              "01",
              "Create your organization",
              "Sign up and get a personal org instantly. Add teams and invite people whenever you're ready.",
              "bg-brand-yellow",
            ],
            [
              "02",
              "Share your link",
              "Post your org or question link anywhere you want honest input — responders never need an account.",
              "bg-brand-mint",
            ],
            [
              "03",
              "Read the signal",
              "Anonymous responses flow into your dashboard, neatly organized by team and question.",
              "bg-brand-blue",
            ],
          ].map(([n, title, body, chip]) => (
            <div
              key={n}
              className="rounded-2xl border-2 border-ink bg-card p-7 shadow-solid"
            >
              <div
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-ink ${chip} text-sm font-black text-ink`}
              >
                {n}
              </div>
              <h3 className="mt-5 text-xl font-black tracking-tight">
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
        <div className="relative overflow-hidden rounded-3xl border-2 border-ink bg-primary px-6 py-20 text-center shadow-solid-lg">
          <MessagesSquare className="mx-auto h-10 w-10 text-primary-foreground/70" />
          <h2 className="relative mt-6 text-4xl font-black tracking-tight text-primary-foreground sm:text-6xl">
            Ready to hear the truth?
          </h2>
          <p className="relative mx-auto mt-6 max-w-xl text-lg text-primary-foreground/80">
            Set up SignalHQ in under a minute. It&apos;s free to start, and
            every response stays anonymous.
          </p>
          <Link
            href="/signup"
            className="relative mt-9 inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-brand-yellow px-8 py-4 text-base font-bold text-ink pop"
          >
            Start for free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
