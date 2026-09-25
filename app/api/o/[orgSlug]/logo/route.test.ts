import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { validPng } from "@/test-utils/imageFixtures";
import { POST } from "@/app/api/organizations/[orgId]/branding/logo/route";
import { GET } from "@/app/api/o/[orgSlug]/logo/route";
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

async function uploadLogo(orgId: Id = w.org) {
  await OrganizationModel.updateOne({ _id: orgId }, { plan: "PRO" });
  sessionFor(getServerSession, w.owner);
  await POST(
    new NextRequest(`http://localhost/api/organizations/${orgId}/branding/logo`, {
      method: "POST",
      body: new Uint8Array(validPng()),
      headers: { "content-type": "image/png" },
      duplex: "half",
    }),
    { params: Promise.resolve({ orgId: String(orgId) }) }
  );
}

async function fetchLogo(orgSlug: string) {
  return GET(new NextRequest(`http://localhost/api/o/${orgSlug}/logo`), {
    params: Promise.resolve({ orgSlug }),
  });
}

describe("GET /api/o/:orgSlug/logo", () => {
  it("serves the stored bytes with exactly the expected headers", async () => {
    await uploadLogo();
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(validPng())).toBe(true);
  });

  it("404s with a uniform body when there's no logo", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "PRO" });
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
  });

  it("404s for an unknown org slug, with the same body as no-logo", async () => {
    const res = await fetchLogo("no-such-org-at-all");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
  });

  it("a downgrade to FREE 404s the logo even though the OrgAsset row still exists", async () => {
    await uploadLogo();
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
  });

  it("ignores the ?v= query param entirely (always serves the current logo)", async () => {
    await uploadLogo();
    const org = await OrganizationModel.findById(w.org);
    const res = await GET(new NextRequest(`http://localhost/api/o/${org!.slug}/logo?v=999`), {
      params: Promise.resolve({ orgSlug: org!.slug }),
    });
    expect(res.status).toBe(200);
  });
});
