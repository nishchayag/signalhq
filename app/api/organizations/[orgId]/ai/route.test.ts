import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
import { aiMock } from "@/test-utils/aiMock";

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET } from "@/app/api/organizations/[orgId]/ai/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import type { MembershipRole } from "@/models/membership.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  aiMock.reset();
});
afterAll(stopTestDB);

function req(orgId: string) {
  return GET(new NextRequest(`http://localhost/api/organizations/${orgId}/ai`), {
    params: Promise.resolve({ orgId }),
  });
}

async function orgWithMember(role: MembershipRole) {
  const ownerId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: ownerId });
  const userId = new mongoose.Types.ObjectId();
  await MembershipModel.create({ organizationId: org._id, userId, role });
  return { orgId: String(org._id), userId: String(userId) };
}

describe("GET /api/organizations/:orgId/ai", () => {
  it("401s with no session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await req(String(new mongoose.Types.ObjectId()));
    expect(res.status).toBe(401);
  });

  it("404s a malformed orgId", async () => {
    getServerSession.mockResolvedValue({ user: { _id: String(new mongoose.Types.ObjectId()) } });
    const res = await req("not-an-id");
    expect(res.status).toBe(404);
  });

  it("403s a user who isn't a member of the org", async () => {
    const { orgId } = await orgWithMember("OWNER");
    getServerSession.mockResolvedValue({ user: { _id: String(new mongoose.Types.ObjectId()) } });
    const res = await req(orgId);
    expect(res.status).toBe(403);
  });

  it("returns enabled:false and no usage when there's no provider key", async () => {
    aiMock.disable();
    const { orgId, userId } = await orgWithMember("OWNER");
    getServerSession.mockResolvedValue({ user: { _id: userId } });
    const res = await req(orgId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.usage).toBeUndefined();
  });

  it("returns usage and resetsAt when enabled", async () => {
    const { orgId, userId } = await orgWithMember("OWNER");
    getServerSession.mockResolvedValue({ user: { _id: userId } });
    const res = await req(orgId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.usage.suggest).toEqual({ used: 0, limit: 30 });
    expect(body.resetsAt).toBeDefined();
  });

  describe("can matrix", () => {
    it("OWNER gets every capability", async () => {
      const { orgId, userId } = await orgWithMember("OWNER");
      getServerSession.mockResolvedValue({ user: { _id: userId } });
      const body = await (await req(orgId)).json();
      expect(body.can).toEqual({
        suggest: true,
        insights: true,
        draft: true,
        viewSafety: true,
        search: true,
      });
    });

    it("ADMIN gets every capability", async () => {
      const { orgId, userId } = await orgWithMember("ADMIN");
      getServerSession.mockResolvedValue({ user: { _id: userId } });
      const body = await (await req(orgId)).json();
      expect(body.can).toEqual({
        suggest: true,
        insights: true,
        draft: true,
        viewSafety: true,
        search: true,
      });
    });

    it("MEMBER gets suggest/search only, never insights/draft/viewSafety", async () => {
      const { orgId, userId } = await orgWithMember("MEMBER");
      getServerSession.mockResolvedValue({ user: { _id: userId } });
      const body = await (await req(orgId)).json();
      expect(body.can).toEqual({
        suggest: true,
        insights: false,
        draft: false,
        viewSafety: false,
        search: true,
      });
    });
  });
});
