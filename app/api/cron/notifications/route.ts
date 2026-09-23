import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/connectDB";
import { flushDailyDigests } from "@/lib/notifications";
import {
  expireStaleInvitations,
  sweepExpiredUnverifiedUsers,
  sweepOrphans,
} from "@/lib/orgCleanup";

// Vercel caps a function run; batching in the helpers keeps each step bounded.
export const maxDuration = 60;

/**
 * GET /api/cron/notifications — the daily job, triggered by the Vercel Cron
 * schedule in vercel.json (once/day, the max frequency Hobby-tier cron
 * allows). Flushes "daily" notification digests, then runs the idempotent
 * cleanup sweeps (expired unverified signups, orphaned memberships/orgs,
 * expired invitations).
 *
 * Gated on CRON_SECRET. If it's unset the route refuses every call — the old
 * `Bearer ${process.env.CRON_SECRET}` comparison matched the literal header
 * "Bearer undefined" in that case.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  await connectDB();

  // Each step is independent: one failing mustn't skip the others.
  const step = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`Cron step "${name}" failed:`, error);
      return { error: true };
    }
  };

  const digests = await step("digests", () => flushDailyDigests());
  const unverifiedUsersDeleted = await step("unverified", () => sweepExpiredUnverifiedUsers());
  const orphans = await step("orphans", () => sweepOrphans());
  const invitationsExpired = await step("invitations", () => expireStaleInvitations());

  return NextResponse.json({
    success: true,
    digests,
    unverifiedUsersDeleted,
    orphans,
    invitationsExpired,
  });
}
