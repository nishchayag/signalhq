import type { MembershipRole } from "@/models/membership.model";

/**
 * Role-based permission matrix for organization actions.
 *
 * Defaults (locked in for SignalHQ multi-tenant):
 *  - OWNER  : everything, incl. renaming/deleting the org and managing owners.
 *  - ADMIN  : manage members (but not owners), full team & question control,
 *             read messages.
 *  - MEMBER : create and view questions, read messages.
 *
 * `message:reply` (replying to a message on behalf of the org, visible to
 * the anonymous sender) is OWNER/ADMIN only — it speaks for the org
 * externally, closer to an administrative action than to reading feedback.
 * Also used for OWNER/ADMIN replying inside a member's private thread on an
 * internal question — same "speaks for the org" framing.
 *
 * `question:answer` (privately answering an internal-visibility question)
 * is available to every role, including MEMBER — unlike `message:reply`,
 * answering doesn't speak for the org, it's the member's own private input.
 *
 * `question:viewAllReplies` (the "View replies" oversight page listing
 * every member's private thread on a question) is OWNER/ADMIN only — a
 * MEMBER only ever sees their own thread, never the full list.
 *
 * `org:billing` (switching the org's plan tier) is OWNER only — a financial
 * decision, same tier as org:rename/org:delete.
 *
 * `message:delete` (permanently removing received feedback) is OWNER/ADMIN
 * only, same framing as `message:reply` — destructive and administrative,
 * whereas MEMBER access to messages is read-only.
 */
export type Permission =
  | "org:rename"
  | "org:delete"
  | "org:billing"
  | "member:invite"
  | "member:remove"
  | "member:role"
  | "team:create"
  | "team:update"
  | "team:delete"
  | "question:create"
  | "question:update"
  | "question:delete"
  | "question:answer"
  | "question:viewAllReplies"
  | "message:read"
  | "message:reply"
  | "message:delete";

const MATRIX: Record<MembershipRole, Permission[]> = {
  OWNER: [
    "org:rename",
    "org:delete",
    "org:billing",
    "member:invite",
    "member:remove",
    "member:role",
    "team:create",
    "team:update",
    "team:delete",
    "question:create",
    "question:update",
    "question:delete",
    "question:answer",
    "question:viewAllReplies",
    "message:read",
    "message:reply",
    "message:delete",
  ],
  ADMIN: [
    "member:invite",
    "member:remove",
    "member:role",
    "team:create",
    "team:update",
    "team:delete",
    "question:create",
    "question:update",
    "question:delete",
    "question:answer",
    "question:viewAllReplies",
    "message:read",
    "message:reply",
    "message:delete",
  ],
  MEMBER: ["question:create", "question:answer", "message:read"],
};

/** Does `role` grant `permission`? */
export function can(
  role: MembershipRole | undefined | null,
  permission: Permission
): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

/** Rank used to forbid acting on a member with an equal-or-higher role. */
const RANK: Record<MembershipRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

/** True if `actor` outranks `target` (strictly higher in the hierarchy). */
export function outranks(
  actor: MembershipRole,
  target: MembershipRole
): boolean {
  return RANK[actor] > RANK[target];
}
