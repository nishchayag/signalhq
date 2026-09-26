import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { getPublicOrg } from "@/lib/publicLookups";
import OrganizationModel from "@/models/organization.model";
import OrgAssetModel from "@/models/orgAsset.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

let n = 0;
async function makeOrg(overrides: Record<string, unknown> = {}) {
  n++;
  return OrganizationModel.create({
    name: `Org ${n}`,
    slug: `org-${n}`,
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

describe("getPublicOrg effectiveBranding", () => {
  it("FREE org: effectiveBranding is null even if branding fields are set", async () => {
    const org = await makeOrg({
      plan: "FREE",
      branding: { accent: "pink", welcomeText: "Hi", logoVersion: 1 },
    });
    const result = await getPublicOrg(org.slug);
    expect(result?.effectiveBranding).toBeNull();
  });

  it("PRO org with no branding set: default accent, empty welcomeText, no logo", async () => {
    const org = await makeOrg({ plan: "PRO" });
    const result = await getPublicOrg(org.slug);
    expect(result?.effectiveBranding).toEqual({ accent: "yellow", welcomeText: "", logoUrl: null });
  });

  it("PRO org with a logo: logoUrl points at the public logo route with ?v=", async () => {
    const org = await makeOrg({
      plan: "PRO",
      branding: { accent: "mint", welcomeText: "Welcome", logoVersion: 3 },
    });
    await OrgAssetModel.create({
      organizationId: org._id,
      kind: "logo",
      contentType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
      size: 3,
      sha256: "z".repeat(64),
    });
    const result = await getPublicOrg(org.slug);
    expect(result?.effectiveBranding).toEqual({
      accent: "mint",
      welcomeText: "Welcome",
      logoUrl: `/api/o/${org.slug}/logo?v=3`,
    });
  });

  it("PRO org with logoVersion>0 but no actual OrgAsset row: logoUrl stays null (no dangling link)", async () => {
    const org = await makeOrg({ plan: "PRO", branding: { logoVersion: 2 } });
    const result = await getPublicOrg(org.slug);
    expect(result?.effectiveBranding?.logoUrl).toBeNull();
  });

  it("downgrading an org that had a real logo hides it from effectiveBranding", async () => {
    const org = await makeOrg({ plan: "PRO", branding: { logoVersion: 1 } });
    await OrgAssetModel.create({
      organizationId: org._id,
      kind: "logo",
      contentType: "image/png",
      bytes: Buffer.from([1]),
      size: 1,
      sha256: "a".repeat(64),
    });
    await OrganizationModel.updateOne({ _id: org._id }, { plan: "FREE" });
    const result = await getPublicOrg(org.slug);
    expect(result?.effectiveBranding).toBeNull();
  });

  it("never returns the logo's bytes on the org lookup itself", async () => {
    const org = await makeOrg({ plan: "PRO", branding: { logoVersion: 1 } });
    await OrgAssetModel.create({
      organizationId: org._id,
      kind: "logo",
      contentType: "image/png",
      bytes: Buffer.alloc(1000, 9),
      size: 1000,
      sha256: "b".repeat(64),
    });
    const result = await getPublicOrg(org.slug);
    expect(JSON.stringify(result)).not.toContain("bytes");
    expect(JSON.stringify(result)?.length).toBeLessThan(500);
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPublicOrg("does-not-exist")).toBeNull();
  });
});
