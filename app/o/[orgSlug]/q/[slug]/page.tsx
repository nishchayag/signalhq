import type { Metadata } from "next";
import QuestionResponseForm from "@/components/QuestionResponseForm";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { getQuestionPreview } from "@/lib/publicLookups";

interface PageProps {
  params: Promise<{ orgSlug: string; slug: string }>;
}

// Link previews show the question itself. Internal questions get a generic
// title — their wording is members-only. noindex: user-generated content.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const preview = await getQuestionPreview(slug);
  const title =
    preview && !preview.internal ? preview.questionText : "Answer a question anonymously";
  return createMetadata({
    title,
    description: "Answer anonymously on SignalHQ. No account needed, and nothing ties your response back to you.",
    url: `/o/${orgSlug}/q/${slug}`,
    noindex: true,
  });
}

// Org-scoped public question page. The response API keys off the global slug,
// so the org segment is for branding/routing only.
export default async function OrgQuestionPage({ params }: PageProps) {
  const { slug } = await params;
  return <QuestionResponseForm slug={slug} />;
}
