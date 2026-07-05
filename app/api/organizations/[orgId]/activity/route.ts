import { NextRequest, NextResponse } from "next/server";
import AuditLogModel from "@/models/auditLog.model";
import "@/models/user.model";
import { requireOrgAccess } from "@/lib/apiAuth";
import { parsePagination, paginate } from "@/lib/pagination";

interface PopulatedActor {
  _id: string;
  name: string;
  username: string;
}

// GET /api/organizations/:orgId/activity — OWNER/ADMIN audit log: role
// changes, member removals, org renames/deletion, ownership transfers, team
// and invitation changes. Most recent first, cursor-paginated via
// ?limit=&before= (see lib/pagination.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgAccess(orgId, "org:viewActivity");
  if (!auth.ok) return auth.response;

  const { limit, before } = parsePagination(request);
  const filter: Record<string, unknown> = { organizationId: orgId };
  if (before) filter.createdAt = { $lt: before };

  const fetched = await AuditLogModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .populate<{ actorUserId: PopulatedActor }>("actorUserId", "name username");
  const { page, hasMore, nextCursor } = paginate(fetched, limit);

  const activity = page.map((e) => {
    const actor = e.actorUserId as unknown as PopulatedActor | null;
    return {
      _id: String(e._id),
      action: e.action,
      metadata: e.metadata,
      createdAt: e.createdAt,
      actor: actor ? { name: actor.name, username: actor.username } : null,
    };
  });

  return NextResponse.json(
    { success: true, activity, hasMore, nextCursor },
    { status: 200 }
  );
}
