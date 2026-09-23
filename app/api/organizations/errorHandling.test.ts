import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { PATCH as renameOrg } from "@/app/api/organizations/[orgId]/route";
import { GET as getTeam } from "@/app/api/organizations/[orgId]/teams/[teamId]/route";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

async function ownerOfOrg() {
  const userId = new mongoose.Types.ObjectId();
  const org = await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: userId });
  await MembershipModel.create({ organizationId: org._id, userId, role: "OWNER" });
  getServerSession.mockResolvedValue({ user: { _id: String(userId) } });
  return String(org._id);
}

// These handlers had no try/catch at all, so both cases below used to
// surface as unhandled 500s (Next's HTML error page for an API client).
describe("org routes are wrapped with withErrorHandling", () => {
  it("returns a JSON 400 for a malformed request body", async () => {
    const orgId = await ownerOfOrg();
    const res = await renameOrg(
      new NextRequest(`http://localhost/api/organizations/${orgId}`, { method: "PATCH", body: "{not json" }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it("returns a JSON 404 for a malformed nested id (CastError)", async () => {
    const orgId = await ownerOfOrg();
    const res = await getTeam(new NextRequest(`http://localhost/api/organizations/${orgId}/teams/nope`), {
      params: Promise.resolve({ orgId, teamId: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
