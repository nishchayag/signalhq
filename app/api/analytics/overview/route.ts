import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/nextAuthOptions";
import connectDB from "@/lib/connectDB";
import MessageModel from "@/models/message.model";
import TeamModel from "@/models/team.model";
import { resolveActiveContext } from "@/lib/orgContext";
import { can } from "@/lib/permissions";
import { withErrorHandling } from "@/lib/apiHandler";
import { isValidObjectId } from "@/lib/objectId";
import { checkRateLimit } from "@/lib/rateLimit";
import { effectiveReadSince, unreadClause } from "@/lib/readState";
import { narrow, orgInboxScope } from "@/lib/triageScope";
import {
  ANALYTICS_RATE_LIMIT,
  analyticsRateKey,
  createdAtClause,
  overviewAggregates,
  parseStatsRange,
  rangeJson,
} from "@/lib/responseStats";

// GET /api/analytics/overview — the active org's response stats. Params and
// the response shape are documented at the top of lib/responseStats.ts.
export const GET = withErrorHandling(async (request: NextRequest) => {
  await connectDB();
  const session = await getServerSession(authOptions);
  const ctx = await resolveActiveContext(session);
  if (!ctx) {
    return NextResponse.json({ success: false, message: "No active organization" }, { status: 401 });
  }
  if (!can(ctx.role, "message:read")) {
    return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
  }
  const userId = String(ctx.membership.userId);

  const { limit, windowMs } = ANALYTICS_RATE_LIMIT;
  if (!(await checkRateLimit(analyticsRateKey(userId), limit, windowMs))) {
    return NextResponse.json(
      { success: false, message: "Too many analytics requests. Please try again later." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const teamIdRaw = searchParams.get("teamId");
  if (teamIdRaw !== null && !isValidObjectId(teamIdRaw)) {
    return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
  }
  const parsed = parseStatsRange(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const { range } = parsed;

  // The inbox scope: organizationId first (the indexed prefix), never member
  // private threads, and team-scoped for MEMBERs. teamId only narrows it.
  const scope = await orgInboxScope(ctx.organizationId, userId, ctx.role);
  const clauses: Record<string, unknown>[] = [createdAtClause(range)];
  if (teamIdRaw) clauses.push({ teamId: new mongoose.Types.ObjectId(teamIdRaw) });
  const match = narrow(scope, ...clauses);

  const open = { archivedAt: null };
  const viewer = { userId, readSince: effectiveReadSince(ctx.membership) };
  const [agg, unread, archived, assigned, awaitingReply] = await Promise.all([
    overviewAggregates(match, range),
    MessageModel.countDocuments(narrow(scope, ...clauses, open, unreadClause(viewer))),
    MessageModel.countDocuments(narrow(scope, ...clauses, { archivedAt: { $ne: null } })),
    MessageModel.countDocuments(
      narrow(scope, ...clauses, open, { assignedTo: { $exists: true, $ne: null } })
    ),
    MessageModel.countDocuments(narrow(scope, ...clauses, open, { awaitingOrg: true })),
  ]);

  const teamIds = agg.byTeam.flatMap((t) => (t.teamId ? [t.teamId] : []));
  const teams = teamIds.length
    ? await TeamModel.find({ _id: { $in: teamIds }, organizationId: scope.organizationId })
        .select("name")
        .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
    : [];
  const names = new Map(teams.map((t) => [String(t._id), t.name]));

  return NextResponse.json({
    success: true,
    range: rangeJson(range),
    totals: agg.totals,
    volume: agg.volume,
    byTeam: agg.byTeam.map((t) => ({
      teamId: t.teamId,
      name: t.teamId ? (names.get(t.teamId) ?? null) : null,
      count: t.count,
    })),
    sentiment: agg.sentiment,
    tags: agg.tags,
    triage: { unread, archived, assigned, awaitingReply },
  });
});
