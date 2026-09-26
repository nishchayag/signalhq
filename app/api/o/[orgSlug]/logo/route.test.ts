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

async function fetchLogo(orgSlug: string, v?: string | number) {
  const qs = v === undefined ? "" : `?v=${v}`;
  return GET(new NextRequest(`http://localhost/api/o/${orgSlug}/logo${qs}`), {
    params: Promise.resolve({ orgSlug }),
  });
}

describe("GET /api/o/:orgSlug/logo", () => {
  it("serves the stored bytes with exactly the expected headers when v matches the current version", async () => {
    await uploadLogo();
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug, org!.branding?.logoVersion);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(validPng())).toBe(true);
  });

  it("404s with a uniform body and no-store when there's no logo", async () => {
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "PRO" });
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug, 1);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s for an unknown org slug, with the same body as no-logo", async () => {
    const res = await fetchLogo("no-such-org-at-all", 1);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("a downgrade to FREE 404s the logo even though the OrgAsset row still exists", async () => {
    await uploadLogo();
    const orgBefore = await OrganizationModel.findById(w.org);
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug, orgBefore!.branding?.logoVersion);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s a stale v after the logo is re-uploaded (version bumped)", async () => {
    await uploadLogo();
    const orgAfterFirst = await OrganizationModel.findById(w.org);
    const staleVersion = orgAfterFirst!.branding?.logoVersion;
    await uploadLogo(); // re-upload bumps branding.logoVersion again
    const res = await fetchLogo(orgAfterFirst!.slug, staleVersion);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s when v is missing entirely", async () => {
    await uploadLogo();
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s when v isn't a valid positive integer", async () => {
    await uploadLogo();
    const org = await OrganizationModel.findById(w.org);
    const res = await fetchLogo(org!.slug, "abc");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, message: "Not found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("every 404 variant returns the identical status, body and Cache-Control", async () => {
    await uploadLogo();
    const orgAfterFirst = await OrganizationModel.findById(w.org);
    const staleVersion = orgAfterFirst!.branding?.logoVersion;
    await uploadLogo();
    await OrganizationModel.updateOne({ _id: w.org }, { plan: "FREE" });

    const variants = await Promise.all([
      fetchLogo("no-such-org-at-all", 1), // unknown org
      fetchLogo(orgAfterFirst!.slug, staleVersion), // FREE plan (also a stale v)
      fetchLogo(orgAfterFirst!.slug, "abc"), // bad v
      fetchLogo(orgAfterFirst!.slug), // missing v
    ]);

    for (const res of variants) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, message: "Not found" });
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
