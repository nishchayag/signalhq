import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { DELETE as deleteOrg } from "@/app/api/organizations/[orgId]/route";
import { DELETE as removeMember } from "@/app/api/organizations/[orgId]/members/[membershipId]/route";
import { PATCH as transferOwnership } from "@/app/api/organizations/[orgId]/transfer-ownership/route";
import { DELETE as revokeInvite } from "@/app/api/organizations/[orgId]/invitations/[invitationId]/route";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import InvitationModel from "@/models/invitation.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let n = 0;
async function user() {
  n++;
  const u = await UserModel.create({
    name: "Person",
    username: `person${n}`,
    email: `person${n}@example.com`,
    password: "x",
    isVerified: true,
  });
  return u._id as mongoose.Types.ObjectId;
}
async function org(ownerId: mongoose.Types.ObjectId) {
  n++;
  const o = await OrganizationModel.create({ name: `Org ${n}`, slug: `org-${n}`, createdBy: ownerId });
  await MembershipModel.create({ organizationId: o._id, userId: ownerId, role: "OWNER" });
  return String(o._id);
}
const as = (id: mongoose.Types.ObjectId) =>
  getServerSession.mockResolvedValue({ user: { _id: String(id) } });
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/x", { method, body: body ? JSON.stringify(body) : undefined });

describe("DELETE /api/organizations/:orgId", () => {
  it("409s when it's the caller's only organization", async () => {
    const owner = await user();
    const only = await org(owner);
    as(owner);
    const res = await deleteOrg(req("DELETE"), { params: Promise.resolve({ orgId: only }) });
    expect(res.status).toBe(409);
    expect(await OrganizationModel.exists({ _id: only })).not.toBeNull();
  });

  it("deletes when the caller has another org, and re-homes members it would strand", async () => {
    const owner = await user();
    await org(owner); // owner's personal org
    const doomed = await org(owner);
    const stranded = await user(); // belongs only to the doomed org
    await MembershipModel.create({ organizationId: doomed, userId: stranded, role: "ADMIN" });
    as(owner);

    const res = await deleteOrg(req("DELETE"), { params: Promise.resolve({ orgId: doomed }) });
    expect(res.status).toBe(200);
    expect(await OrganizationModel.exists({ _id: doomed })).toBeNull();
    // They got a fresh personal org instead of being left with nothing.
    const rehomed = await MembershipModel.findOne({ userId: stranded });
    expect(rehomed?.role).toBe("OWNER");
    expect(String(rehomed?.organizationId)).not.toBe(doomed);
  });
});

describe("leaving an organization", () => {
  it("409s when it's the member's only organization", async () => {
    const owner = await user();
    const shared = await org(owner);
    const admin = await user();
    const m = await MembershipModel.create({ organizationId: shared, userId: admin, role: "ADMIN" });
    as(admin);
    const res = await removeMember(req("DELETE"), {
      params: Promise.resolve({ orgId: shared, membershipId: String(m._id) }),
    });
    expect(res.status).toBe(409);
    expect(await MembershipModel.exists({ _id: m._id })).not.toBeNull();
  });

  it("lets them leave when they belong to another org", async () => {
    const owner = await user();
    const shared = await org(owner);
    const admin = await user();
    await org(admin);
    const m = await MembershipModel.create({ organizationId: shared, userId: admin, role: "ADMIN" });
    as(admin);
    const res = await removeMember(req("DELETE"), {
      params: Promise.resolve({ orgId: shared, membershipId: String(m._id) }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH transfer-ownership", () => {
  it("moves Organization.createdBy to the new owner", async () => {
    const owner = await user();
    const target = await user();
    const orgId = await org(owner);
    const m = await MembershipModel.create({ organizationId: orgId, userId: target, role: "ADMIN" });
    as(owner);
    const res = await transferOwnership(req("PATCH", { membershipId: String(m._id) }), {
      params: Promise.resolve({ orgId }),
    });
    expect(res.status).toBe(200);
    const updated = await OrganizationModel.findById(orgId);
    expect(String(updated?.createdBy)).toBe(String(target));
  });
});

describe("DELETE invitation (revoke)", () => {
  it("409s for an invitation that's no longer pending", async () => {
    const owner = await user();
    const orgId = await org(owner);
    const inv = await InvitationModel.create({
      organizationId: orgId,
      email: "joined@example.com",
      token: "tok-accepted",
      invitedBy: owner,
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 1e6),
    });
    as(owner);
    const res = await revokeInvite(req("DELETE"), {
      params: Promise.resolve({ orgId, invitationId: String(inv._id) }),
    });
    expect(res.status).toBe(409);
    expect((await InvitationModel.findById(inv._id))?.status).toBe("ACCEPTED");
  });
});
