import { notFound, redirect } from "next/navigation";
import connectDB from "@/lib/connectDB";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";

interface PageProps {
  params: Promise<{ username: string }>;
}

// Legacy public profile URL. Now redirects to the user's org-scoped feedback
// page (/o/[orgSlug]) for the fully org-scoped routing scheme.
export default async function LegacyUserPage({ params }: PageProps) {
  const { username } = await params;
  await connectDB();

  // Usernames are stored lowercase; old links like /u/Aditya must still work.
  const user = await UserModel.findOne({
    username: username.toLowerCase(),
  }).select("_id");
  if (!user) notFound();

  // The personal org is the user's oldest membership — the same rule
  // resolveActiveContext uses. Not `createdBy`: that follows ownership now
  // (transfer-ownership moves it), so it no longer means "personal org".
  const membership = await MembershipModel.findOne({ userId: user._id })
    .sort({ createdAt: 1 })
    .select("organizationId");
  if (!membership) notFound();
  const org = await OrganizationModel.findById(membership.organizationId).select("slug");
  if (!org) notFound();

  redirect(`/o/${org.slug}`);
}
