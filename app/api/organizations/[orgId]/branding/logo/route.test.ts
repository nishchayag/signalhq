import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import {
  disguisedSvg,
  jpegWithTrailingData,
  multipartBody,
  pngWithTrailingHtml,
  truncated,
  validJpeg,
  validPng,
  validWebp,
} from "@/test-utils/imageFixtures";
import { POST, DELETE } from "@/app/api/organizations/[orgId]/branding/logo/route";
import OrganizationModel from "@/models/organization.model";
import OrgAssetModel from "@/models/orgAsset.model";
import AuditLogModel from "@/models/auditLog.model";
import { LOGO_MAX_BYTES } from "@/lib/brandingConstants";

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

async function setPlan(plan: "FREE" | "PRO" | "ENTERPRISE", orgId: Id = w.org) {
  await OrganizationModel.updateOne({ _id: orgId }, { plan });
}

function rawReq(
  url: string,
  method: string,
  body: Buffer,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: new Uint8Array(body),
    headers,
    duplex: "half",
  });
}

const upload = (body: Buffer, headers: Record<string, string> = {}, orgId: Id = w.org) =>
  POST(rawReq(`/api/organizations/${orgId}/branding/logo`, "POST", body, headers), orgP(orgId));
const remove = (orgId: Id = w.org) =>
  DELETE(
    new NextRequest(`http://localhost/api/organizations/${orgId}/branding/logo`, { method: "DELETE" }),
    orgP(orgId)
  );

describe("POST /api/organizations/:orgId/branding/logo", () => {
  it("FREE org: 403 even for the OWNER, nothing stored", async () => {
    as(w.owner);
    const res = await upload(validPng(), { "content-type": "image/png" });
    expect(res.status).toBe(403);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
  });

  it("MEMBER: 403 even on a PRO org", async () => {
    await setPlan("PRO");
    as(w.memberA);
    expect((await upload(validPng(), { "content-type": "image/png" })).status).toBe(403);
  });

  it("accepts a valid PNG (raw body), bumps logoVersion, and audits", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(validPng(), { "content-type": "image/png" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, logoVersion: 1 });

    const asset = await OrgAssetModel.findOne({ organizationId: w.org, kind: "logo" }).select("+bytes");
    expect(asset!.contentType).toBe("image/png");
    expect(asset!.bytes.equals(validPng())).toBe(true);
    expect(asset!.size).toBe(validPng().length);

    const org = await OrganizationModel.findById(w.org);
    expect(org!.branding?.logoVersion).toBe(1);
    expect(await AuditLogModel.countDocuments({ action: "branding.logo_uploaded" })).toBe(1);
  });

  it("accepts a valid JPEG and a valid WebP", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await upload(validJpeg(), { "content-type": "image/jpeg" })).status).toBe(200);
    expect((await upload(validWebp(), { "content-type": "image/webp" })).status).toBe(200);
    const asset = await OrgAssetModel.findOne({ organizationId: w.org, kind: "logo" });
    expect(asset!.contentType).toBe("image/webp"); // the second upload replaced the first
    expect(await OrgAssetModel.countDocuments({ organizationId: w.org, kind: "logo" })).toBe(1);
  });

  it("re-uploading replaces the logo and keeps bumping logoVersion", async () => {
    await setPlan("PRO");
    as(w.owner);
    await upload(validPng(), { "content-type": "image/png" });
    const res2 = await upload(validJpeg(), { "content-type": "image/jpeg" });
    expect((await res2.json()).logoVersion).toBe(2);
    expect(await OrgAssetModel.countDocuments({})).toBe(1);
  });

  it("ignores the client's declared Content-Type and sniffs the real bytes", async () => {
    await setPlan("PRO");
    as(w.owner);
    // A real JPEG mislabeled as PNG must still be accepted (and stored) as
    // what it actually is.
    const res = await upload(validJpeg(), { "content-type": "image/png" });
    expect(res.status).toBe(200);
    const asset = await OrgAssetModel.findOne({ organizationId: w.org, kind: "logo" });
    expect(asset!.contentType).toBe("image/jpeg");
  });

  it("rejects a disguised SVG claiming to be image/png", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(disguisedSvg(), { "content-type": "image/png" });
    expect(res.status).toBe(400);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
  });

  it("rejects an HTML-in-PNG polyglot (trailing data after IEND)", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(pngWithTrailingHtml(), { "content-type": "image/png" });
    expect(res.status).toBe(400);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
  });

  it("rejects a JPEG with trailing data after EOI", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(jpegWithTrailingData(), { "content-type": "image/jpeg" });
    expect(res.status).toBe(400);
  });

  it("rejects a truncated file", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(truncated(validPng()), { "content-type": "image/png" });
    expect(res.status).toBe(400);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
  });

  it("oversize (>100KB) → 413, checked without storing anything", async () => {
    await setPlan("PRO");
    as(w.owner);
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1, 1);
    const res = await upload(big, {
      "content-type": "image/png",
      "content-length": String(big.length),
    });
    expect(res.status).toBe(413);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
  });

  it("oversize is rejected even when Content-Length lies (streaming cap)", async () => {
    await setPlan("PRO");
    as(w.owner);
    const big = Buffer.alloc(LOGO_MAX_BYTES + 1, 1);
    // Declare a small Content-Length but actually send more — the streaming
    // reader must cap on real bytes read, not trust the header.
    const res = await upload(big, { "content-type": "image/png", "content-length": "10" });
    expect(res.status).toBe(413);
  });

  it("accepts a multipart/form-data upload with a 'file' field", async () => {
    await setPlan("PRO");
    as(w.owner);
    const { body, contentType } = multipartBody(validPng(), { contentType: "image/png" });
    const res = await upload(body, { "content-type": contentType });
    expect(res.status).toBe(200);
    const asset = await OrgAssetModel.findOne({ organizationId: w.org, kind: "logo" }).select("+bytes");
    expect(asset!.bytes.equals(validPng())).toBe(true);
    expect(asset!.contentType).toBe("image/png");
  });

  it("rejects a malformed multipart body with 400, not 500", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(Buffer.from("not actually multipart"), {
      "content-type": "multipart/form-data; boundary=xyz",
    });
    expect(res.status).toBe(400);
  });

  it("empty body → 400", async () => {
    await setPlan("PRO");
    as(w.owner);
    const res = await upload(Buffer.alloc(0), { "content-type": "image/png" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/organizations/:orgId/branding/logo", () => {
  it("removes the logo, bumps logoVersion, and audits", async () => {
    await setPlan("PRO");
    as(w.owner);
    await upload(validPng(), { "content-type": "image/png" });

    const res = await remove();
    expect(res.status).toBe(200);
    expect(await OrgAssetModel.countDocuments({})).toBe(0);
    const org = await OrganizationModel.findById(w.org);
    expect(org!.branding?.logoVersion).toBe(2);
    expect(await AuditLogModel.countDocuments({ action: "branding.logo_removed" })).toBe(1);
  });

  it("404 when there's no logo to remove", async () => {
    await setPlan("PRO");
    as(w.owner);
    expect((await remove()).status).toBe(404);
  });

  it("MEMBER: 403", async () => {
    await setPlan("PRO");
    as(w.memberA);
    expect((await remove()).status).toBe(403);
  });

  it("FREE org: 403", async () => {
    as(w.owner);
    expect((await remove()).status).toBe(403);
  });
});
