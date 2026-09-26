import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { canAccessQuestion, teamScopeFilter } from "@/lib/questionAccess";
import TeamModel from "@/models/team.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

const orgId = new mongoose.Types.ObjectId();
const member = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();

async function teamWith(members: mongoose.Types.ObjectId[]) {
  return TeamModel.create({
    organizationId: orgId,
    name: "Eng",
    slug: `eng-${members.length}-${Date.now()}`,
    createdBy: member,
    members,
  });
}

describe("canAccessQuestion", () => {
  it("lets OWNER and ADMIN see any team's question", async () => {
    const team = await teamWith([member]);
    for (const role of ["OWNER", "ADMIN"] as const) {
      expect(await canAccessQuestion({ teamId: team._id }, String(outsider), role)).toBe(true);
    }
  });

  it("lets anyone in the org see an org-level (no team) question", async () => {
    expect(await canAccessQuestion({ teamId: undefined }, String(outsider), "MEMBER")).toBe(true);
  });

  it("lets a MEMBER see their own team's question but not another team's", async () => {
    const team = await teamWith([member]);
    expect(await canAccessQuestion({ teamId: team._id }, String(member), "MEMBER")).toBe(true);
    expect(await canAccessQuestion({ teamId: team._id }, String(outsider), "MEMBER")).toBe(false);
  });
});

describe("teamScopeFilter", () => {
  it("returns no restriction for OWNER/ADMIN", async () => {
    expect(await teamScopeFilter(String(orgId), String(member), "OWNER")).toBeNull();
    expect(await teamScopeFilter(String(orgId), String(member), "ADMIN")).toBeNull();
  });

  it("limits a MEMBER to org-level questions plus their own teams", async () => {
    const team = await teamWith([member]);
    const filter = await teamScopeFilter(String(orgId), String(member), "MEMBER");
    expect(filter).toEqual({ $or: [{ teamId: null }, { teamId: { $in: [team._id] } }] });
  });
});
