import { notFound, redirect } from "next/navigation";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";

interface PageProps {
  params: Promise<{ username: string }>;
}

// Legacy public profile URL. Now redirects to the user's org-scoped feedback
// page (/o/[orgSlug]) for the fully org-scoped routing scheme.
export default async function LegacyUserPage({ params }: PageProps) {
  const { username } = await params;
  await connectDB();

  const user = await UserModel.findOne({ username }).select("_id");
  if (!user) notFound();

  // The personal org is the oldest org created by this user (from the backfill).
  const org = await OrganizationModel.findOne({ createdBy: user._id })
    .sort({ createdAt: 1 })
    .select("slug");
  if (!org) notFound();

  redirect(`/o/${org.slug}`);
}
