import QuestionResponseForm from "@/components/QuestionResponseForm";

interface PageProps {
  params: Promise<{ orgSlug: string; slug: string }>;
}

// Org-scoped public question page. The response API keys off the global slug,
// so the org segment is for branding/routing only.
export default async function OrgQuestionPage({ params }: PageProps) {
  const { slug } = await params;
  return <QuestionResponseForm slug={slug} />;
}
