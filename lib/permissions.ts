import type { MembershipRole } from "@/models/membership.model";

/**
 * Role-based permission matrix for organization actions.
 *
 * Defaults (locked in for SignalHQ multi-tenant):
 *  - OWNER  : everything, incl. renaming/deleting the org and managing owners.
 *  - ADMIN  : manage members (but not owners), full team & question control,
 *             read messages.
 *  - MEMBER : create and view questions, read messages.
 */
export type Permission =
  | "org:rename"
  | "org:delete"
  | "member:invite"
  | "member:remove"
  | "member:role"
  | "team:create"
  | "team:update"
  | "team:delete"
  | "question:create"
  | "question:update"
  | "question:delete"
  | "message:read";

const MATRIX: Record<MembershipRole, Permission[]> = {
  OWNER: [
    "org:rename",
    "org:delete",
    "member:invite",
    "member:remove",
    "member:role",
    "team:create",
    "team:update",
    "team:delete",
    "question:create",
    "question:update",
    "question:delete",
    "message:read",
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
    "message:read",
  ],
  MEMBER: ["question:create", "message:read"],
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
