import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { requireOrgAccess } from "@/lib/apiAuth";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

describe("requireOrgAccess", () => {
  it("401s when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const result = await requireOrgAccess(String(new mongoose.Types.ObjectId()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("403s when the session has no membership in the organization", async () => {
    const userId = new mongoose.Types.ObjectId();
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const result = await requireOrgAccess(String(new mongoose.Types.ObjectId()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("403s when the member's role lacks the requested permission", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "MEMBER",
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const result = await requireOrgAccess(String(org._id), "org:billing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns ok:true with the membership attached when permission is granted", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "OWNER",
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const result = await requireOrgAccess(String(org._id), "org:billing");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(String(result.membership.organizationId)).toBe(String(org._id));
      expect(result.userId).toBe(String(userId));
    }
  });

  it("returns ok:true when no specific permission is requested, regardless of role", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: userId,
    });
    await MembershipModel.create({
      organizationId: org._id,
      userId,
      role: "MEMBER",
    });
    getServerSession.mockResolvedValue({ user: { _id: String(userId) } });

    const result = await requireOrgAccess(String(org._id));
    expect(result.ok).toBe(true);
  });

  it("404s (not 500s) a malformed organization id, including the literal \"undefined\"", async () => {
    getServerSession.mockResolvedValue({
      user: { _id: String(new mongoose.Types.ObjectId()) },
    });
    for (const bad of ["not-an-id", "undefined", "null", ""]) {
      const result = await requireOrgAccess(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(404);
    }
  });

  it("still 401s an unauthenticated caller before looking at the id", async () => {
    getServerSession.mockResolvedValue(null);
    const result = await requireOrgAccess("not-an-id");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
