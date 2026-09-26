import { notFound, permanentRedirect } from "next/navigation";
import { getCanonicalQuestion } from "@/lib/publicLookups";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Legacy question URL: permanently redirects to the canonical org-scoped
// page. Every question has an org since the multi-tenant backfill, so one
// without an (existing) org is treated as not found.
export default async function LegacyQuestionPage({ params }: PageProps) {
  const { slug } = await params;
  const question = await getCanonicalQuestion(slug);
  if (!question) notFound();
  permanentRedirect(question.path);
}
