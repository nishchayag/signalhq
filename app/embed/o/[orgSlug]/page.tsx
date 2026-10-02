import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import QuestionModel from "@/models/question.model";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { getPublicOrg } from "@/lib/publicLookups";
import { questionState } from "@/lib/answers";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import OrgFeedbackForm from "@/components/OrgFeedbackForm";
import PublicBrandHeader from "@/components/PublicBrandHeader";
import EmbedAutoResize from "@/components/EmbedAutoResize";
import EmbedBadge from "@/components/EmbedBadge";
import { isGuardOffered } from "@/lib/aiQuota";
import type { PulseCadence } from "@/lib/pulse";
import { Repeat } from "lucide-react";

const PULSE_BADGE_LABEL: Record<PulseCadence, string> = {
  weekly: "Repeats weekly",
  biweekly: "Repeats every 2 weeks",
  monthly: "Repeats monthly",
};

interface PageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Embed pages are never indexed or followed — they're a widget, not a page
// anyone should land on from search.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getPublicOrg(orgSlug);
  if (!organization) {
    return createMetadata({ title: "Organization not found", noindex: true, nofollow: true });
  }
  return createMetadata({
    title: `Send anonymous feedback to ${organization.name}`,
    noindex: true,
    nofollow: true,
  });
}

/**
 * Embeddable org feedback widget — framed by public/embed.js on another
 * site. A trimmed copy of app/o/[orgSlug]/page.tsx: same general-feedback
 * form and active-question list, but every question link stays under
 * /embed/q/* (never the full /o/* page, which would break out of the
 * iframe's intended use) and the page never redirects — an unknown org is
 * simply a 404, there's no canonical-URL mismatch to resolve here like the
 * question page has.
 */
export default async function EmbedOrgPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params;
  const organization = await getPublicOrg(orgSlug);
  if (!organization) notFound();

  // Forwarded as-is onto the /embed/q/* links below so a visitor who picks a
  // specific question keeps the same theme the host page chose — validation
  // of the value happens again on that page (lib/securityHeaders.ts), so an
  // invalid value here is harmless, just ignored downstream.
  const sp = await searchParams;
  const themeParam = typeof sp.theme === "string" ? sp.theme : undefined;
  const themeQuery = themeParam ? `?theme=${encodeURIComponent(themeParam)}` : "";

  const guardAvailable = await isGuardOffered(organization._id);

  const allQuestions = await QuestionModel.find({
    organizationId: organization._id,
    isActive: true,
    visibility: { $ne: "internal" },
  })
    .sort({ createdAt: -1 })
    .select("questionText slug closesAt maxResponses responseCount pulse")
    .lean();
  const questions = allQuestions.filter((q) => !questionState(q).closed);

  return (
    <div className="bg-dot-grid px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <EmbedAutoResize />
        <PublicBrandHeader
          orgName={organization.name}
          branding={organization.effectiveBranding}
          fallbackSubtitle="Share anonymous feedback — your identity is never revealed"
          compact
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center font-black">
              Send anonymous feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgFeedbackForm
              orgSlug={organization.slug}
              guardAvailable={guardAvailable}
              orgName={organization.name}
              embed
            />
          </CardContent>
        </Card>

        {questions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-foreground mb-3">
              Or respond to a specific question:
            </h2>
            <div className="grid gap-3">
              {questions.map((q) => (
                <Link
                  key={String(q._id)}
                  href={`/embed/q/${q.slug}${themeQuery}`}
                  className="flex items-center justify-between gap-3 bg-card hover:bg-secondary transition border-2 border-ink rounded-lg px-4 py-3 text-sm font-semibold text-foreground shadow-solid-sm"
                >
                  <span>{q.questionText}</span>
                  {q.pulse && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-brand-blue/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                      <Repeat className="h-3 w-3" />
                      {PULSE_BADGE_LABEL[q.pulse.cadence]}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {organization.showBadge && <EmbedBadge />}
      </div>
    </div>
  );
}
