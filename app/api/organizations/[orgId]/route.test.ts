import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { GET } from "@/app/api/organizations/[orgId]/route";
import { PATCH as patchBranding } from "@/app/api/organizations/[orgId]/branding/route";
import OrganizationModel from "@/models/organization.model";

type Id = mongoose.Types.ObjectId;

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

let w: TriageWorld;
beforeEach(async () => {
  w = await seedTriageWorld();
});
const as = (u: Id) => sessionFor(getServerSession, u);
const orgP = (orgId: Id = w.org) => ({ params: Promise.resolve({ orgId: String(orgId) }) });
const get = (orgId: Id = w.org) => GET(jsonReq(`/api/organizations/${orgId}`, "GET"), orgP(orgId));

async function setPlan(plan: "FREE" | "PRO" | "ENTERPRISE", orgId: Id = w.org) {
  await OrganizationModel.updateOne({ _id: orgId }, { plan });
}

describe("GET /api/organizations/:orgId", () => {
  it("FREE org: default branding view, brandingAllowed false", async () => {
    as(w.owner);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.branding).toEqual({ accent: "yellow", welcomeText: "", logoVersion: 0 });
    expect(body.brandingAllowed).toBe(false);
    // Never leaks logo bytes.
    expect(body.organization.branding?.bytes).toBeUndefined();
  });

  it("PRO org: reflects stored branding and brandingAllowed true", async () => {
    await setPlan("PRO");
    as(w.owner);
    await patchBranding(
      jsonReq(`/api/organizations/${w.org}/branding`, "PATCH", { accent: "mint", welcomeText: "Hi there" }),
      orgP()
    );
    const res = await get();
    const body = await res.json();
    expect(body.branding).toEqual({ accent: "mint", welcomeText: "Hi there", logoVersion: 0 });
    expect(body.brandingAllowed).toBe(true);
  });

  it("a plain MEMBER can read branding settings too (not secret to members)", async () => {
    await setPlan("PRO");
    as(w.memberA);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.branding).toEqual({ accent: "yellow", welcomeText: "", logoVersion: 0 });
  });

  it("outsider: 403", async () => {
    as(w.outsider);
    expect((await get()).status).toBe(403);
  });

  it("a downgrade to FREE keeps the stored branding readable, just not allowed", async () => {
    await setPlan("PRO");
    as(w.owner);
    await patchBranding(
      jsonReq(`/api/organizations/${w.org}/branding`, "PATCH", { accent: "blue" }),
      orgP()
    );
    await setPlan("FREE");
    const res = await get();
    const body = await res.json();
    expect(body.branding.accent).toBe("blue");
    expect(body.brandingAllowed).toBe(false);
  });
});
