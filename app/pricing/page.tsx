import Link from "next/link";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { PLAN_ORDER, PLAN_LIMITS, PLAN_DISPLAY } from "@/lib/plans";

const CHIP: Record<string, string> = {
  FREE: "bg-brand-yellow",
  PRO: "bg-brand-mint",
  ENTERPRISE: "bg-brand-blue",
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  const activePlan = session?.user?.activeOrgPlan;

  return (
    <div className="bg-background text-foreground">
      <section className="relative overflow-hidden border-b-2 border-ink bg-dot-grid">
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-4 py-1.5 text-sm font-bold text-foreground shadow-solid-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Early access
          </span>
          <h1 className="mx-auto mt-8 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Pricing that&apos;s{" "}
            <span className="highlight">free right now.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            We haven&apos;t locked in pricing yet — every plan below is free
            to use while we&apos;re in early access. No credit card required.
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const limit = PLAN_LIMITS[p].maxTeams;
              const isCurrent = p === activePlan;
              return (
                <div
                  key={p}
                  className={`flex flex-col rounded-2xl border-2 border-ink bg-card p-6 text-left shadow-solid ${
                    isCurrent ? "bg-brand-mint/20" : ""
                  }`}
                >
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-ink ${CHIP[p]} text-sm font-black text-on-brand`}
                  >
                    {PLAN_DISPLAY[p].name.charAt(0)}
                  </span>
                  <h2 className="mt-4 text-xl font-black tracking-tight">
                    {PLAN_DISPLAY[p].name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {PLAN_DISPLAY[p].tagline}
                  </p>
                  <p className="mt-5 text-4xl font-black tracking-tight">
                    {p === "FREE" ? "Free" : "???"}
                  </p>
                  <p className="mb-5 text-xs text-muted-foreground">
                    {p === "FREE" ? "forever" : "price coming soon"}
                  </p>
                  <ul className="flex-1 space-y-2.5 text-sm">
                    {PLAN_DISPLAY[p].features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs font-semibold text-muted-foreground">
                    {limit !== null ? `Up to ${limit} teams` : "Unlimited teams"}
                  </p>
                  {isCurrent ? (
                    <span className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-secondary px-4 py-2.5 text-sm font-bold text-foreground">
                      <Check className="h-4 w-4" />
                      Currently on this plan
                    </span>
                  ) : (
                    <Link
                      href={session ? "/dashboard/organization" : "/signup"}
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground pop"
                    >
                      {session ? "Switch to this plan" : "Get started free"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
