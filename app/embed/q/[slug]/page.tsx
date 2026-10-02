import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QuestionResponseForm from "@/components/QuestionResponseForm";
import EmbedAutoResize from "@/components/EmbedAutoResize";
import EmbedBadge from "@/components/EmbedBadge";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { getCanonicalQuestion, getPublicOrg } from "@/lib/publicLookups";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Embed pages are never indexed or followed — they're a widget, not a page
// anyone should land on from search. Internal questions get the same
// generic title as the "not found" case: their wording is members-only.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const question = await getCanonicalQuestion(slug);
  const title = !question || question.internal ? "Question not found" : question.questionText;
  return createMetadata({ title, noindex: true, nofollow: true });
}

/**
 * Embeddable question page — framed by public/embed.js on another site.
 * Takes only the question's global slug, with no org segment, which is
 * deliberate: app/o/[orgSlug]/q/[slug]/page.tsx permanentRedirect()s when
 * the URL's org disagrees with the question's real one, but an embed must
 * never redirect (the spec here, same as c1's framing work — a mid-load
 * navigation inside an iframe is jarring and the loader script doesn't
 * follow one). Dropping the org segment entirely means there's no
 * disagreement to redirect for in the first place; an unknown or internal
 * question just 404s.
 */
export default async function EmbedQuestionPage({ params }: PageProps) {
  const { slug } = await params;
  const question = await getCanonicalQuestion(slug);
  if (!question || question.internal) notFound();
  // getPublicOrg is cache()'d per orgSlug — cheap even though
  // getCanonicalQuestion already looked the org up once above (it doesn't
  // return branding/showBadge).
  const organization = await getPublicOrg(question.orgSlug);
  if (!organization) notFound();

  return (
    <>
      <EmbedAutoResize />
      <QuestionResponseForm
        slug={question.slug}
        orgName={organization.name}
        branding={organization.effectiveBranding}
        embed
      />
      {organization.showBadge && (
        <div className="bg-dot-grid px-4">
          <div className="mx-auto max-w-2xl">
            <EmbedBadge />
          </div>
        </div>
      )}
    </>
  );
}
