import { cache } from "react";
import connectDB from "@/lib/connectDB";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import { getEffectiveBranding } from "@/lib/branding";

// React cache(): generateMetadata and the page component in the same request
// share one lookup instead of querying Mongo twice.

/**
 * Public org by slug: name/slug plus `effectiveBranding` (null unless the
 * org's current plan allows it — see lib/branding.ts). Never the logo's
 * bytes, only a `logoUrl` the client fetches separately from the public
 * logo route.
 */
export const getPublicOrg = cache(async (orgSlug: string) => {
  await connectDB();
  const org = await OrganizationModel.findOne({ slug: orgSlug })
    .select("name slug plan branding")
    .lean();
  if (!org) return null;
  const effectiveBranding = await getEffectiveBranding(org);
  return { _id: org._id, name: org.name, slug: org.slug, effectiveBranding };
});

/**
 * A public question's canonical location plus just enough for a share
 * preview. The slug is globally unique, so the question — not the URL's org
 * segment — decides which org it belongs to; pages redirect to
 * `/o/${orgSlug}/q/${slug}` when the URL disagrees. Returns null when the
 * question doesn't exist or has no (existing) org, so callers 404.
 *
 * Internal questions return `internal: true` with no text — their wording is
 * for members only and must never appear in a public page title or unfurl.
 */
export const getCanonicalQuestion = cache(async (slug: string) => {
  await connectDB();
  const q = await QuestionModel.findOne({ slug: slug.toLowerCase() })
    .select("slug questionText visibility organizationId")
    .lean();
  if (!q?.organizationId) return null;
  const org = await OrganizationModel.findById(q.organizationId).select("slug").lean();
  if (!org) return null;
  const location = { slug: q.slug, orgSlug: org.slug, path: `/o/${org.slug}/q/${q.slug}` };
  if (q.visibility === "internal") return { ...location, internal: true as const };
  return { ...location, internal: false as const, questionText: q.questionText };
});
