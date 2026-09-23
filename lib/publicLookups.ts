import { cache } from "react";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";

// React cache(): generateMetadata and the page component in the same request
// share one lookup instead of querying Mongo twice.

/** Public org by slug (name + slug only), or null. */
export const getPublicOrg = cache(async (orgSlug: string) => {
  await connectDB();
  return OrganizationModel.findOne({ slug: orgSlug }).select("name slug").lean();
});

/**
 * Just enough of a question for a share preview. Internal questions return
 * `internal: true` with no text — their wording is for members only and
 * must never appear in a public page title or link unfurl.
 */
export const getQuestionPreview = cache(async (slug: string) => {
  await connectDB();
  const q = await QuestionModel.findOne({ slug: slug.toLowerCase() })
    .select("questionText visibility")
    .lean();
  if (!q) return null;
  if (q.visibility === "internal") return { internal: true as const };
  return { internal: false as const, questionText: q.questionText };
});
