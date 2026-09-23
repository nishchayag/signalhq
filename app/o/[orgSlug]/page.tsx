import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import QuestionModel from "@/models/question.model";
import { generateMetadata as createMetadata } from "@/lib/metadata";
import { getPublicOrg } from "@/lib/publicLookups";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import OrgFeedbackForm from "@/components/OrgFeedbackForm";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

// Shared links unfurl with the org's name instead of the generic site title.
// noindex: these are user-generated pages, not marketing content.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getPublicOrg(orgSlug);
  if (!organization) return createMetadata({ title: "Organization not found", noindex: true });
  return createMetadata({
    title: `Send anonymous feedback to ${organization.name}`,
    description: `Share honest, anonymous feedback with ${organization.name}. No account needed, and nothing ties the message back to you.`,
    url: `/o/${organization.slug}`,
    noindex: true,
  });
}

// Public org feedback landing page — general feedback + active questions.
export default async function OrgPublicPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const organization = await getPublicOrg(orgSlug);
  if (!organization) notFound();

  const questions = await QuestionModel.find({
    organizationId: organization._id,
    isActive: true,
    // Internal questions are never listed on the public page. `$ne` (not
    // `visibility: "public"`) so pre-migration questions with no stored
    // `visibility` field still show up — they default to public.
    visibility: { $ne: "internal" },
  })
    .sort({ createdAt: -1 })
    .select("questionText slug")
    .lean();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-dot-grid py-16 px-4">
      <div className="relative max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-brand-yellow text-ink text-xl font-black">
            {organization.name.charAt(0).toUpperCase()}
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            {organization.name}
          </h1>
          <p className="text-muted-foreground">
            Share anonymous feedback — your identity is never revealed
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center font-black">
              Send anonymous feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrgFeedbackForm orgSlug={organization.slug} />
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
                  href={`/o/${organization.slug}/q/${q.slug}`}
                  className="block bg-card hover:bg-secondary transition border-2 border-ink rounded-lg px-4 py-3 text-sm font-semibold text-foreground shadow-solid-sm"
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
