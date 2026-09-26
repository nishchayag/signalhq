import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import {
  jsonReq,
  msg,
  rawDoc,
  seedTriageWorld,
  sessionFor,
  type TriageWorld,
} from "@/test-utils/triageFixture";
import {
  DELETE as removeMember,
  PATCH as changeRole,
} from "@/app/api/organizations/[orgId]/members/[membershipId]/route";
import { PATCH as updateTeam } from "@/app/api/organizations/[orgId]/teams/[teamId]/route";
import { DELETE as deleteAccount } from "@/app/api/account/delete/route";
import { deleteUnverifiedUser, sweepOrphans, unassignUser } from "@/lib/orgCleanup";
import MembershipModel from "@/models/membership.model";
import OrganizationModel from "@/models/organization.model";
import UserModel from "@/models/user.model";
import TeamModel from "@/models/team.model";

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
const assignee = async (id: Id) => {
  const d = (await rawDoc(id))!;
  return d.assignedTo === undefined ? undefined : String(d.assignedTo);
};
const membershipOf = async (userId: Id, orgId: Id = w.org) =>
  String((await MembershipModel.findOne({ organizationId: orgId, userId }))!._id);

describe("unassign on member removal / leave", () => {
  it("removing a member unassigns them in that org only, $unsetting all three fields", async () => {
    await MembershipModel.create({ organizationId: w.other, userId: w.memberA, role: "MEMBER" });
    const here = await msg(w, "here", { assignedTo: w.memberA, assignedAt: new Date(), assignedBy: w.owner });
    const keep = await msg(w, "keep", { assignedTo: w.admin });
    const there = await msg(w, "there", { organizationId: w.other, assignedTo: w.memberA });
    as(w.owner);
    const mid = await membershipOf(w.memberA);
    const res = await removeMember(jsonReq("/x", "DELETE"), {
      params: Promise.resolve({ orgId: String(w.org), membershipId: mid }),
    });
    expect(res.status).toBe(200);
    const doc = (await rawDoc(here))!;
    for (const k of ["assignedTo", "assignedAt", "assignedBy"]) expect(doc).not.toHaveProperty(k);
    expect(await assignee(keep)).toBe(String(w.admin));
    expect(await assignee(there)).toBe(String(w.memberA));
  });

  it("leaving unassigns too", async () => {
    await MembershipModel.create({ organizationId: w.other, userId: w.memberB, role: "MEMBER" });
    const m = await msg(w, "m", { assignedTo: w.memberB });
    as(w.memberB);
    const res = await removeMember(jsonReq("/x", "DELETE"), {
      params: Promise.resolve({ orgId: String(w.org), membershipId: await membershipOf(w.memberB) }),
    });
    expect(res.status).toBe(200);
    expect(await assignee(m)).toBeUndefined();
  });
});

describe("unassign when access is lost", () => {
  it("team PATCH removing a MEMBER unassigns them from that team's messages only", async () => {
    const onA = await msg(w, "a", { questionId: w.qA, assignedTo: w.memberA });
    const general = await msg(w, "g", { assignedTo: w.memberA });
    const adminOnA = await msg(w, "a2", { questionId: w.qA, assignedTo: w.admin });
    as(w.owner);
    // Put the admin on team A, then take both the admin and memberA off it.
    const p = () => ({ params: Promise.resolve({ orgId: String(w.org), teamId: String(w.teamA) }) });
    await updateTeam(jsonReq("/x", "PATCH", { memberIds: [String(w.memberA), String(w.admin)] }), p());
    const res = await updateTeam(jsonReq("/x", "PATCH", { memberIds: [] }), p());
    expect(res.status).toBe(200);
    expect(await assignee(onA)).toBeUndefined();
    expect(await assignee(general)).toBe(String(w.memberA));
    expect(await assignee(adminOnA)).toBe(String(w.admin)); // ADMIN keeps access
  });

  it("demoting an ADMIN to MEMBER unassigns them from teams they're not on", async () => {
    const onA = await msg(w, "a", { questionId: w.qA, assignedTo: w.admin });
    const onB = await msg(w, "b", { questionId: w.qB, assignedTo: w.admin });
    const general = await msg(w, "g", { assignedTo: w.admin });
    await TeamModel.updateOne({ _id: w.teamB }, { $addToSet: { members: w.admin } });
    as(w.owner);
    const res = await changeRole(jsonReq("/x", "PATCH", { role: "MEMBER" }), {
      params: Promise.resolve({ orgId: String(w.org), membershipId: await membershipOf(w.admin) }),
    });
    expect(res.status).toBe(200);
    expect(await assignee(onA)).toBeUndefined();
    expect(await assignee(onB)).toBe(String(w.admin));
    expect(await assignee(general)).toBe(String(w.admin));
  });
});

describe("unassign on account deletion and cleanup helpers", () => {
  it("account delete unassigns across every org", async () => {
    await MembershipModel.create({ organizationId: w.other, userId: w.memberA, role: "MEMBER" });
    await UserModel.updateOne({ _id: w.memberA }, { password: await bcrypt.hash("pw", 4) });
    const here = await msg(w, "here", { assignedTo: w.memberA });
    const there = await msg(w, "there", { organizationId: w.other, assignedTo: w.memberA });
    as(w.memberA);
    const res = await deleteAccount(jsonReq("/api/account/delete", "DELETE", { password: "pw" }));
    expect(res.status).toBe(200);
    expect(await assignee(here)).toBeUndefined();
    expect(await assignee(there)).toBeUndefined();
  });

  it("unassignUser respects its filter; deleteUnverifiedUser unassigns", async () => {
    const a = await msg(w, "a", { assignedTo: w.memberA });
    const b = await msg(w, "b", { organizationId: w.other, assignedTo: w.memberA });
    expect(await unassignUser(w.memberA, { organizationId: w.other })).toBe(1);
    expect(await assignee(a)).toBe(String(w.memberA));
    expect(await assignee(b)).toBeUndefined();
    await deleteUnverifiedUser(w.memberA);
    expect(await assignee(a)).toBeUndefined();
  });

  it("sweepOrphans unassigns the users whose memberships it removes", async () => {
    const m = await msg(w, "m", { assignedTo: w.memberB });
    await UserModel.deleteOne({ _id: w.memberB });
    const out = await sweepOrphans();
    expect(out.memberships).toBe(1);
    expect(await assignee(m)).toBeUndefined();
    expect(await OrganizationModel.exists({ _id: w.org })).not.toBeNull();
  });
});
