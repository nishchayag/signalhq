import type { Session } from "next-auth";
import mongoose from "mongoose";
import OrganizationModel, { IOrganization } from "@/models/organization.model";
import MembershipModel, {
  IMembership,
  MembershipRole,
} from "@/models/membership.model";
import { uniqueSlug } from "@/lib/slug";

export interface OrgContext {
  organization: IOrganization;
  membership: IMembership;
  role: MembershipRole;
  organizationId: string;
}

/**
 * Resolve the organization a request should act on.
 *
 * Preference order:
 *   1. The `activeOrgId` carried on the session (set by the org switcher),
 *      provided the user actually has a membership there.
 *   2. The user's oldest membership (their personal org) as a safe fallback.
 *
 * Always DB-validated — the session value is never trusted on its own, so a
 * stale or forged `activeOrgId` cannot escalate access.
 *
 * Callers must have already called `connectDB()`.
 */
export async function resolveActiveContext(
  session: Session | null
): Promise<OrgContext | null> {
  const userId = session?.user?._id;
  if (!userId) return null;

  const desiredOrgId = session.user.activeOrgId;

  let membership: IMembership | null = null;
  if (desiredOrgId) {
    membership = await MembershipModel.findOne({
      organizationId: desiredOrgId,
      userId,
    });
  }

  // Fallback: oldest membership (the personal org for migrated users).
  if (!membership) {
    membership = await MembershipModel.findOne({ userId }).sort({
      createdAt: 1,
    });
  }

  if (!membership) return null;

  const organization = await OrganizationModel.findById(
    membership.organizationId
  );
  if (!organization) return null;

  return {
    organization,
    membership,
    role: membership.role,
    organizationId: String(organization._id),
  };
}

/**
 * Resolve the org fields to stamp onto a JWT. Used by the auth `jwt` callback
 * both at sign-in (no `desiredOrgId` → default/personal org) and when the org
 * switcher fires an update (`desiredOrgId` → validated switch).
 */
export async function getActiveOrgForToken(
  userId: string,
  desiredOrgId?: string
): Promise<{ organizationId: string; slug: string; role: MembershipRole } | null> {
  let membership: IMembership | null = null;
  if (desiredOrgId) {
    membership = await MembershipModel.findOne({
      organizationId: desiredOrgId,
      userId,
    });
  }
  if (!membership) {
    membership = await MembershipModel.findOne({ userId }).sort({
      createdAt: 1,
    });
  }
  if (!membership) return null;

  const org = await OrganizationModel.findById(membership.organizationId).select(
    "slug"
  );
  if (!org) return null;

  return {
    organizationId: String(membership.organizationId),
    slug: org.slug,
    role: membership.role,
  };
}

/**
 * Create a personal organization for a brand-new user and make them its OWNER.
 * Mirrors the Phase 1 backfill so every account has an active org from the
 * start (org-scoped reads return nothing without one). Callers must have
 * already called connectDB().
 */
export async function createPersonalOrganization(user: {
  _id: string | mongoose.Types.ObjectId;
  name?: string;
  username: string;
}): Promise<IOrganization> {
  const displayName = user.name || user.username;
  const slug = await uniqueSlug(displayName, OrganizationModel);
  const userId = new mongoose.Types.ObjectId(user._id);

  const organization = await OrganizationModel.create({
    name: displayName,
    slug,
    createdBy: userId,
  });
  await MembershipModel.create({
    organizationId: organization._id,
    userId,
    role: "OWNER",
  });
  return organization;
}

/** Membership for a specific (user, org) pair, or null. */
export async function getMembership(
  userId: string,
  organizationId: string
): Promise<IMembership | null> {
  return MembershipModel.findOne({ organizationId, userId });
}

/** All organizations the user belongs to, with their role in each. */
export async function listUserOrganizations(userId: string): Promise<
  {
    _id: string;
    name: string;
    slug: string;
    role: MembershipRole;
  }[]
> {
  const memberships = await MembershipModel.find({ userId })
    .sort({ createdAt: 1 })
    .populate<{ organizationId: IOrganization }>("organizationId", "name slug");

  return memberships
    .filter((m) => m.organizationId)
    .map((m) => {
      const org = m.organizationId as unknown as IOrganization;
      return {
        _id: String(org._id),
        name: org.name,
        slug: org.slug,
        role: m.role,
      };
    });
}
