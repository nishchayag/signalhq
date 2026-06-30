import { notFound } from "next/navigation";
import Link from "next/link";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import OrgFeedbackForm from "@/components/OrgFeedbackForm";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

// Public org feedback landing page — general feedback + active questions.
export default async function OrgPublicPage({ params }: PageProps) {
  const { orgSlug } = await params;
  await connectDB();

  const organization = await OrganizationModel.findOne({ slug: orgSlug }).select(
    "name slug"
  );
  if (!organization) notFound();

  const questions = await QuestionModel.find({
    organizationId: organization._id,
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .select("questionText slug")
    .lean();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {organization.name}
          </h1>
          <p className="text-gray-600">
            Share anonymous feedback — your identity is never revealed
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center">
              Send anonymous feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgFeedbackForm orgSlug={organization.slug} />
          </CardContent>
        </Card>

        {questions.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Or respond to a specific question:
            </h2>
            <div className="grid gap-3">
              {questions.map((q) => (
                <Link
                  key={String(q._id)}
                  href={`/o/${organization.slug}/q/${q.slug}`}
                  className="block bg-white hover:bg-indigo-50 transition border border-gray-200 rounded-lg px-4 py-3 text-sm shadow-sm"
                >
                  {q.questionText}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
