import { redirect } from "next/navigation";
import connectDB from "@/lib/connectDB";
import QuestionModel from "@/models/question.model";
import OrganizationModel from "@/models/organization.model";
import QuestionResponseForm from "@/components/QuestionResponseForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Legacy question URL. Redirects to the org-scoped equivalent when the question
// belongs to an org; otherwise renders the response form inline (legacy data).
export default async function LegacyQuestionPage({ params }: PageProps) {
  const { slug } = await params;
  await connectDB();

  const question = await QuestionModel.findOne({ slug }).select(
    "organizationId"
  );

  if (question?.organizationId) {
    const org = await OrganizationModel.findById(
      question.organizationId
    ).select("slug");
    if (org) redirect(`/o/${org.slug}/q/${slug}`);
  }

  // Fallback for questions that predate the org migration.
  return <QuestionResponseForm slug={slug} />;
}
