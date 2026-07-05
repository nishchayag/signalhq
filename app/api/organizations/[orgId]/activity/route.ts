import { NextRequest, NextResponse } from "next/server";
import AuditLogModel from "@/models/auditLog.model";
import "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";

interface PopulatedActor {
  _id: string;
  name: string;
  username: string;
}

// GET /api/organizations/:orgId/activity — OWNER/ADMIN audit log: role
// changes, member removals, org renames/deletion, ownership transfers, team
// and invitation changes. Most recent first, capped at 100 (real pagination
// lands with the broader pagination work).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:viewActivity");
  if (!auth.ok) return auth.response;

  const entries = await AuditLogModel.find({ organizationId: orgId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ actorUserId: PopulatedActor }>("actorUserId", "name username");

  const activity = entries.map((e) => {
    const actor = e.actorUserId as unknown as PopulatedActor | null;
    return {
      _id: String(e._id),
      action: e.action,
      metadata: e.metadata,
      createdAt: e.createdAt,
      actor: actor ? { name: actor.name, username: actor.username } : null,
    };
  });

  return NextResponse.json({ success: true, activity }, { status: 200 });
}
