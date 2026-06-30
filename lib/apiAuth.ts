import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MembershipModel, { IMembership } from "@/models/membership.model";
import { can, Permission } from "@/lib/permissions";
import type { Session } from "next-auth";

type Ok = {
  ok: true;
  session: Session;
  userId: string;
  membership: IMembership;
};
type Fail = { ok: false; response: NextResponse };

/**
 * Gate an org-scoped API route. Verifies the caller is authenticated, holds a
 * membership in `organizationId`, and (optionally) that their role grants
 * `permission`. Calls connectDB() so handlers don't have to repeat it.
 */
export async function requireOrgAccess(
  organizationId: string,
  permission?: Permission
): Promise<Ok | Fail> {
  await connectDB();
  const session = await getServerSession(authOptions);

  if (!session?.user?._id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  const membership = await MembershipModel.findOne({
    organizationId,
    userId: session.user._id,
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "You are not a member of this organization" },
        { status: 403 }
      ),
    };
  }

  if (permission && !can(membership.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Insufficient permissions" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session, userId: String(session.user._id), membership };
}
