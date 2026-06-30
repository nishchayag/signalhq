import { NextRequest, NextResponse } from "next/server";
import MembershipModel from "@/models/membership.model";
import "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";

interface PopulatedUser {
  _id: string;
  name: string;
  username: string;
  email: string;
}

// GET /api/organizations/:orgId/members — list members (any member may view).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId);
  if (!auth.ok) return auth.response;

  const memberships = await MembershipModel.find({ organizationId: orgId })
    .sort({ createdAt: 1 })
    .populate<{ userId: PopulatedUser }>("userId", "name username email");

  const members = memberships
    .filter((m) => m.userId)
    .map((m) => {
      const u = m.userId as unknown as PopulatedUser;
      return {
        membershipId: String(m._id),
        userId: String(u._id),
        name: u.name,
        username: u.username,
        email: u.email,
        role: m.role,
        joinedAt: m.createdAt,
        isSelf: String(u._id) === auth.userId,
      };
    });

  return NextResponse.json(
    { success: true, members, myRole: auth.membership.role },
    { status: 200 }
  );
}
