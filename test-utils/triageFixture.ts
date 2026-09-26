import mongoose from "mongoose";
import { NextRequest } from "next/server";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

// Shared seed for the triage route tests (triage/bulk/counts/labels): one
// org with an OWNER, an ADMIN, a MEMBER on team A and a MEMBER on team B,
// plus a second org ("other") with its own owner and label.

type Id = mongoose.Types.ObjectId;

export interface TriageWorld {
  org: Id;
  other: Id;
  owner: Id;
  admin: Id;
  memberA: Id;
  memberB: Id;
  outsider: Id;
  teamA: Id;
  teamB: Id;
  qOrg: Id; // org-level public question
  qA: Id; // team A public question
  qB: Id; // team B public question
  qInternal: Id;
  labels: Id[]; // the org's labels [bug, idea, urgent, praise, later, extra]
  foreignLabel: Id; // a label of the other org
}

let n = 0;
async function user(name: string): Promise<Id> {
  n++;
  const u = await UserModel.create({
    name,
    username: `${name.toLowerCase()}${n}`,
    email: `${name.toLowerCase()}${n}@t.com`,
    password: "x",
    isVerified: true,
  });
  return u._id as unknown as Id;
}

const DAY = 24 * 60 * 60 * 1000;
/** Every membership in the world was created this long ago. */
export const JOINED = new Date(Date.now() - 30 * DAY);

export async function seedTriageWorld(): Promise<TriageWorld> {
  const [owner, admin, memberA, memberB, outsider] = [
    await user("Owner"),
    await user("Admin"),
    await user("MemA"),
    await user("MemB"),
    await user("Out"),
  ];
  n++;
  const labelNames = ["bug", "idea", "urgent", "praise", "later", "extra"];
  const orgDoc = await OrganizationModel.create({
    name: "Acme",
    slug: `acme-${n}`,
    createdBy: owner,
    labels: labelNames.map((name) => ({ name, color: "yellow" })),
  });
  const otherDoc = await OrganizationModel.create({
    name: "Other",
    slug: `other-${n}`,
    createdBy: outsider,
    labels: [{ name: "bug", color: "pink" }],
  });
  const org = orgDoc._id as unknown as Id;
  const other = otherDoc._id as unknown as Id;
  const createdAt = JOINED;
  await MembershipModel.create([
    { organizationId: org, userId: owner, role: "OWNER", createdAt },
    { organizationId: org, userId: admin, role: "ADMIN", createdAt },
    { organizationId: org, userId: memberA, role: "MEMBER", createdAt },
    { organizationId: org, userId: memberB, role: "MEMBER", createdAt },
    { organizationId: other, userId: outsider, role: "OWNER", createdAt },
  ]);
  const teamA = (await TeamModel.create({ organizationId: org, name: "A team", slug: "a", createdBy: owner, members: [memberA] }))
    ._id as unknown as Id;
  const teamB = (await TeamModel.create({ organizationId: org, name: "B team", slug: "b", createdBy: owner, members: [memberB] }))
    ._id as unknown as Id;
  const q = async (slug: string, extra: Record<string, unknown> = {}) =>
    (await QuestionModel.create({ questionText: slug, userId: owner, organizationId: org, slug: `${slug}-${n}`, ...extra }))
      ._id as unknown as Id;
  return {
    org,
    other,
    owner,
    admin,
    memberA,
    memberB,
    outsider,
    teamA,
    teamB,
    qOrg: await q("qorg"),
    qA: await q("qa", { teamId: teamA }),
    qB: await q("qb", { teamId: teamB }),
    qInternal: await q("qint", { visibility: "internal" }),
    labels: orgDoc.labels!.map((l) => l._id as Id),
    foreignLabel: otherDoc.labels![0]._id as Id,
  };
}

/** A message in `w.org` (general unless `questionId`); team mirrored from the question. */
export async function msg(
  w: TriageWorld,
  content: string,
  extra: Record<string, unknown> = {}
): Promise<Id> {
  const teamOf: Record<string, Id> = { [String(w.qA)]: w.teamA, [String(w.qB)]: w.teamB };
  const qid = extra.questionId ? String(extra.questionId) : null;
  const m = await MessageModel.create({
    content,
    createdFor: w.owner,
    organizationId: w.org,
    ...(qid && teamOf[qid] ? { teamId: teamOf[qid] } : {}),
    ...extra,
  });
  return m._id as unknown as Id;
}

/** Raw field writes (e.g. readBy, which is select:false). */
export async function raw(id: Id, set: Record<string, unknown>) {
  await MessageModel.collection.updateOne({ _id: id }, { $set: set });
}

export async function rawDoc(id: Id): Promise<Record<string, unknown> | null> {
  return MessageModel.collection.findOne({ _id: id });
}

export function sessionFor(
  getServerSession: { mockResolvedValue: (v: unknown) => unknown },
  userId: Id,
  activeOrgId?: Id
) {
  getServerSession.mockResolvedValue({
    user: { _id: String(userId), ...(activeOrgId && { activeOrgId: String(activeOrgId) }) },
  });
}

export function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
