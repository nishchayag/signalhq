import { describe, expect, it } from "vitest";
import { can, outranks, type Permission } from "@/lib/permissions";
import type { MembershipRole } from "@/models/membership.model";

const ALL_PERMISSIONS: Permission[] = [
  "org:rename",
  "org:delete",
  "org:billing",
  "org:transferOwnership",
  "org:viewActivity",
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
];

// Ground truth mirrored from lib/permissions.ts's MATRIX, kept independent
// of the implementation so a mutation there is actually caught.
const GRANTED: Record<MembershipRole, Set<Permission>> = {
  OWNER: new Set(ALL_PERMISSIONS),
  ADMIN: new Set([
    "org:viewActivity",
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
  ]),
  MEMBER: new Set(["question:create", "question:answer", "message:read"]),
};

describe("can", () => {
  for (const role of Object.keys(GRANTED) as MembershipRole[]) {
    for (const permission of ALL_PERMISSIONS) {
      const expected = GRANTED[role].has(permission);
      it(`${role} ${expected ? "is" : "is not"} granted ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }

  it("OWNER-only permissions are denied to ADMIN and MEMBER", () => {
    for (const permission of [
      "org:rename",
      "org:delete",
      "org:billing",
      "org:transferOwnership",
    ] as Permission[]) {
      expect(can("ADMIN", permission)).toBe(false);
      expect(can("MEMBER", permission)).toBe(false);
    }
  });

  it("returns false for a null or undefined role", () => {
    expect(can(null, "message:read")).toBe(false);
    expect(can(undefined, "message:read")).toBe(false);
  });
});

describe("outranks", () => {
  const roles: MembershipRole[] = ["OWNER", "ADMIN", "MEMBER"];
  const expected: Record<string, boolean> = {
    "OWNER-OWNER": false,
    "OWNER-ADMIN": true,
    "OWNER-MEMBER": true,
    "ADMIN-OWNER": false,
    "ADMIN-ADMIN": false,
    "ADMIN-MEMBER": true,
    "MEMBER-OWNER": false,
    "MEMBER-ADMIN": false,
    "MEMBER-MEMBER": false,
  };

  for (const actor of roles) {
    for (const target of roles) {
      it(`${actor} ${expected[`${actor}-${target}`] ? "outranks" : "does not outrank"} ${target}`, () => {
        expect(outranks(actor, target)).toBe(expected[`${actor}-${target}`]);
      });
    }
  }
});
