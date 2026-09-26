import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import type { Session } from "next-auth";
import { clearTestDB, startTestDB, stopTestDB } from "@/test-utils/db";
import {
  createPersonalOrganization,
  getActiveOrgForToken,
  getMembership,
  listUserOrganizations,
  resolveActiveContext,
} from "@/lib/orgContext";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import OrgAssetModel from "@/models/orgAsset.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

function fakeSession(userId: string, activeOrgId?: string): Session {
  return {
    user: { _id: userId, activeOrgId },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function makeOrgWithMembership(userId: mongoose.Types.ObjectId, name: string) {
  const org = await OrganizationModel.create({
    name,
    slug: name.toLowerCase(),
    createdBy: userId,
  });
  const membership = await MembershipModel.create({
    organizationId: org._id,
    userId,
    role: "OWNER",
  });
  return { org, membership };
}

describe("resolveActiveContext", () => {
  it("returns null when the session has no user id", async () => {
    expect(await resolveActiveContext(null)).toBeNull();
    expect(await resolveActiveContext({ user: {}, expires: "" })).toBeNull();
  });

  it("returns null when the user has no memberships", async () => {
    const userId = new mongoose.Types.ObjectId();
    expect(await resolveActiveContext(fakeSession(String(userId)))).toBeNull();
  });

  it("uses activeOrgId when it matches a real membership", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org: orgA } = await makeOrgWithMembership(userId, "OrgA");
    const { org: orgB } = await makeOrgWithMembership(userId, "OrgB");

    const ctx = await resolveActiveContext(
      fakeSession(String(userId), String(orgB._id))
    );
    expect(ctx?.organizationId).toBe(String(orgB._id));
    void orgA;
  });

  it("falls back to the oldest membership when activeOrgId is forged or stale", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org: older, membership: olderMembership } =
      await makeOrgWithMembership(userId, "Older");
    await makeOrgWithMembership(userId, "Newer");
    // Force deterministic ordering rather than relying on real-clock timing
    // between two sequential creates.
    await MembershipModel.updateOne(
      { _id: olderMembership._id },
      { createdAt: new Date(Date.now() - 1000 * 60 * 60) }
    );

    const forgedOrgId = String(new mongoose.Types.ObjectId());
    const ctx = await resolveActiveContext(fakeSession(String(userId), forgedOrgId));
    expect(ctx?.organizationId).toBe(String(older._id));
  });

  it("falls back to the oldest membership when no activeOrgId is given", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org: older, membership: olderMembership } =
      await makeOrgWithMembership(userId, "Older");
    await makeOrgWithMembership(userId, "Newer");
    await MembershipModel.updateOne(
      { _id: olderMembership._id },
      { createdAt: new Date(Date.now() - 1000 * 60 * 60) }
    );

    const ctx = await resolveActiveContext(fakeSession(String(userId)));
    expect(ctx?.organizationId).toBe(String(older._id));
  });
});

describe("resolveActiveContext never loads logo bytes", () => {
  it("returns an org doc with no bytes/OrgAsset data even when a logo exists", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org } = await makeOrgWithMembership(userId, "Branded");
    await OrganizationModel.updateOne(
      { _id: org._id },
      { plan: "PRO", "branding.logoVersion": 1 }
    );
    // A real (if tiny) logo row, so this test would fail loudly — a huge
    // payload back on ctx.organization, or a slow query joining it in — if
    // resolveActiveContext ever started pulling OrgAsset in.
    await OrgAssetModel.create({
      organizationId: org._id,
      kind: "logo",
      contentType: "image/png",
      bytes: Buffer.alloc(50_000, 7),
      size: 50_000,
      sha256: "y".repeat(64),
    });

    const ctx = await resolveActiveContext(fakeSession(String(userId), String(org._id)));
    expect(ctx).not.toBeNull();
    const raw = ctx!.organization.toObject();
    expect(raw).not.toHaveProperty("bytes");
    expect(raw).not.toHaveProperty("logo");
    expect(raw.branding).toMatchObject({ logoVersion: 1 });
    // Sanity: the whole serialized doc is small — nowhere near the 50KB
    // logo, confirming the bytes were never fetched alongside it.
    expect(JSON.stringify(raw).length).toBeLessThan(1000);
  });
});

describe("getActiveOrgForToken", () => {
  it("returns null when the user has no memberships", async () => {
    const userId = String(new mongoose.Types.ObjectId());
    expect(await getActiveOrgForToken(userId)).toBeNull();
  });

  it("returns the org matching desiredOrgId when valid", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org } = await makeOrgWithMembership(userId, "OrgA");

    const result = await getActiveOrgForToken(String(userId), String(org._id));
    expect(result).toMatchObject({
      organizationId: String(org._id),
      slug: org.slug,
      role: "OWNER",
      plan: "FREE",
    });
  });

  it("falls back to the oldest membership when desiredOrgId doesn't match", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org } = await makeOrgWithMembership(userId, "OrgA");

    const result = await getActiveOrgForToken(
      String(userId),
      String(new mongoose.Types.ObjectId())
    );
    expect(result?.organizationId).toBe(String(org._id));
  });
});

describe("createPersonalOrganization", () => {
  it("creates an organization and makes the user its OWNER", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await createPersonalOrganization({
      _id: userId,
      name: "Jane Doe",
      username: "janedoe",
    });

    expect(org.name).toBe("Jane Doe");
    expect(org.slug).toBe("jane-doe");

    const membership = await getMembership(String(userId), String(org._id));
    expect(membership?.role).toBe("OWNER");
  });

  it("falls back to username when name is absent", async () => {
    const userId = new mongoose.Types.ObjectId();
    const org = await createPersonalOrganization({
      _id: userId,
      username: "janedoe",
    });
    expect(org.name).toBe("janedoe");
  });
});

describe("getMembership", () => {
  it("returns the membership for a matching (user, org) pair", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org, membership } = await makeOrgWithMembership(userId, "OrgA");

    const result = await getMembership(String(userId), String(org._id));
    expect(String(result?._id)).toBe(String(membership._id));
  });

  it("returns null when no membership exists", async () => {
    const result = await getMembership(
      String(new mongoose.Types.ObjectId()),
      String(new mongoose.Types.ObjectId())
    );
    expect(result).toBeNull();
  });
});

describe("listUserOrganizations", () => {
  it("returns every org the user belongs to, oldest first, with role", async () => {
    const userId = new mongoose.Types.ObjectId();
    const { org: older, membership: olderMembership } =
      await makeOrgWithMembership(userId, "Older");
    const { org: newer } = await makeOrgWithMembership(userId, "Newer");
    await MembershipModel.updateOne(
      { _id: olderMembership._id },
      { createdAt: new Date(Date.now() - 1000 * 60 * 60) }
    );

    const orgs = await listUserOrganizations(String(userId));
    expect(orgs.map((o) => o._id)).toEqual([String(older._id), String(newer._id)]);
    expect(orgs.every((o) => o.role === "OWNER")).toBe(true);
  });

  it("returns an empty array for a user with no memberships", async () => {
    const orgs = await listUserOrganizations(String(new mongoose.Types.ObjectId()));
    expect(orgs).toEqual([]);
  });
});
