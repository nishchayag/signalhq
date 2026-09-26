import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import QuestionResponseForm from "@/components/QuestionResponseForm";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { getCanonicalQuestion, getPublicOrg } from "@/lib/publicLookups";

interface PageProps {
  params: Promise<{ orgSlug: string; slug: string }>;
}

// Link previews show the question itself. Internal questions get a generic
// title — their wording is members-only. noindex: user-generated content.
// Always the canonical URL: a wrong-org URL never unfurls as that org.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const question = await getCanonicalQuestion(slug);
  if (!question) return createMetadata({ title: "Question not found", noindex: true });
  const title = question.internal ? "Answer a question anonymously" : question.questionText;
  return createMetadata({
    title,
    description: "Answer anonymously on SignalHQ. No account needed, and nothing ties your response back to you.",
    url: question.path,
    noindex: true,
  });
}

// Org-scoped public question page. The slug is globally unique, so the
// question decides its org: a URL naming any other org (or a differently
// cased slug) permanently redirects to the canonical one, and an unknown
// question 404s. The response API keys off the slug alone and stamps the
// question's own organizationId, so the org segment never reaches it.
export default async function OrgQuestionPage({ params }: PageProps) {
  const { orgSlug, slug } = await params;
  const question = await getCanonicalQuestion(slug);
  if (!question) notFound();
  if (question.orgSlug !== orgSlug || question.slug !== slug) {
    permanentRedirect(question.path);
  }
  // getPublicOrg is cache()'d per orgSlug — cheap even though getCanonicalQuestion
  // already looked the org up once above (it doesn't return branding).
  const organization = await getPublicOrg(question.orgSlug);
  return (
    <QuestionResponseForm
      slug={question.slug}
      orgName={organization?.name}
      branding={organization?.effectiveBranding ?? null}
    />
  );
}
