import mongoose from "mongoose";
import type { MembershipRole } from "@/models/membership.model";
import { teamScopeFilter } from "@/lib/questionAccess";

// The org-wide set of messages a viewer may bulk-triage or count: the org's
// own messages, never member private threads (read-only triage, one at a
// time via PATCH), and — for a MEMBER — only org-level and own-team ones.
// Every bulk updateMany / counts aggregation starts from this, so ids from
// another org or team simply don't match. Values are real ObjectIds (not
// strings) so the same filter works in an aggregation, which doesn't cast.

export interface OrgInboxScope {
  organizationId: mongoose.Types.ObjectId;
  authorType: { $ne: "member" };
  $and: Record<string, unknown>[];
}

export async function orgInboxScope(
  organizationId: string | mongoose.Types.ObjectId,
  userId: string,
  role: MembershipRole
): Promise<OrgInboxScope> {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const team = await teamScopeFilter(String(orgId), userId, role);
  return {
    organizationId: orgId,
    authorType: { $ne: "member" },
    $and: team ? [team] : [],
  };
}

/** `scope` narrowed by more clauses (kept in `$and`, so `$or`s never clash). */
export function narrow(
  scope: OrgInboxScope,
  ...clauses: Record<string, unknown>[]
): Record<string, unknown> {
  const and = [...scope.$and, ...clauses];
  const { $and: _ignored, ...rest } = scope;
  void _ignored;
  return and.length > 0 ? { ...rest, $and: and } : rest;
}
