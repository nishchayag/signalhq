import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { clearTestDB, startTestDB, stopTestDB } from "@/test-utils/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import OrganizationModel from "@/models/organization.model";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("Acme & Co.!!")).toBe("acme-co");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Acme--  ")).toBe("acme");
  });

  it("truncates to 40 characters", () => {
    expect(slugify("a".repeat(60)).length).toBe(40);
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  beforeAll(startTestDB);
  afterEach(clearTestDB);
  afterAll(stopTestDB);

  const createdBy = () => new mongoose.Types.ObjectId();

  it("returns the base slug when there is no collision", async () => {
    const slug = await uniqueSlug("Acme Corp", OrganizationModel);
    expect(slug).toBe("acme-corp");
  });

  it("appends -2, -3 on successive collisions", async () => {
    await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: createdBy(),
    });
    const second = await uniqueSlug("Acme", OrganizationModel);
    expect(second).toBe("acme-2");

    await OrganizationModel.create({
      name: "Acme",
      slug: "acme-2",
      createdBy: createdBy(),
    });
    const third = await uniqueSlug("Acme", OrganizationModel);
    expect(third).toBe("acme-3");
  });

  it("falls back to the given fallback when the name has no alphanumeric characters", async () => {
    const slug = await uniqueSlug("!!!", OrganizationModel, {}, "org");
    expect(slug).toBe("org");
  });

  it("scopes uniqueness to the given extraFilter", async () => {
    // Mirrors real usage (e.g. team slugs unique per-organization, not
    // globally): a colliding slug outside the filtered scope (here, a
    // different plan tier standing in for "a different organization") does
    // not block reuse of the base slug within the scope being checked.
    await OrganizationModel.create({
      name: "Acme",
      slug: "acme",
      createdBy: createdBy(),
      plan: "FREE",
    });
    const slug = await uniqueSlug("Acme", OrganizationModel, {
      plan: "PRO",
    });
    expect(slug).toBe("acme");
  });
});
