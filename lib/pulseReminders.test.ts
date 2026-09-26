import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

interface PulseBatchArgs {
  recipients: string[];
  orgName: string;
  questionText: string;
  publicUrl: string;
  settingsUrl: string;
  idempotencyKey: string;
}
const { sendPulseReminderBatch } = vi.hoisted(() => ({
  sendPulseReminderBatch: vi.fn<(args: PulseBatchArgs) => Promise<boolean>>(async () => true),
}));
vi.mock("@/lib/mailService", () => ({ sendPulseReminderBatch }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { sendPulseReminders } from "@/lib/pulseReminders";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";
import TeamModel from "@/models/team.model";
import QuestionModel from "@/models/question.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  sendPulseReminderBatch.mockClear();
  sendPulseReminderBatch.mockResolvedValue(true);
});
afterAll(stopTestDB);

let n = 0;
async function makeUser(overrides: Record<string, unknown> = {}) {
  n++;
  return UserModel.create({
    name: "Person",
    username: `pulseuser${n}`,
    email: `pulseuser${n}@example.com`,
    password: "x".repeat(20),
    isVerified: true,
    ...overrides,
  });
}

async function makeOrg(plan: "FREE" | "PRO" | "ENTERPRISE" = "PRO") {
  const owner = await makeUser();
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: `acme-${n}`,
    createdBy: owner._id,
    plan,
  });
  await MembershipModel.create({ organizationId: org._id, userId: owner._id, role: "OWNER" });
  return { org, owner };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function makeDueQuestion(
  orgId: mongoose.Types.ObjectId,
  ownerId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) {
  return QuestionModel.create({
    questionText: "How's the sprint going?",
    userId: ownerId,
    organizationId: orgId,
    slug: `pulse-${n}-${Math.random().toString(36).slice(2, 8)}`,
    pulse: {
      cadence: "weekly",
      anchorDate: daysAgo(2),
      timeZone: "UTC",
      remind: true,
      lastRemindedRound: -1,
    },
    ...overrides,
  });
}

describe("sendPulseReminders: basic send + claim", () => {
  it("sends one batch for a due round and stamps lastRemindedRound", async () => {
    const { org, owner } = await makeOrg();
    const q = await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);

    const result = await sendPulseReminders();
    expect(result).toMatchObject({ candidates: 1, sent: 1, restored: 0, skipped: 0 });
    expect(sendPulseReminderBatch).toHaveBeenCalledTimes(1);
    expect(sendPulseReminderBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: [owner.email],
        idempotencyKey: `pulse:${q._id}:0:0`,
      })
    );
    const stored = await QuestionModel.findById(q._id).lean();
    expect(stored?.pulse?.lastRemindedRound).toBe(0);
    expect(stored?.pulse?.lastRemindedAt).toBeInstanceOf(Date);
  });

  it("overlapping calls send exactly one batch", async () => {
    const { org, owner } = await makeOrg();
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);

    const [a, b] = await Promise.all([sendPulseReminders(), sendPulseReminders()]);
    expect(a.sent + b.sent).toBe(1);
    expect(sendPulseReminderBatch).toHaveBeenCalledTimes(1);
  });

  it("a question not yet reminded but already past the round (scheduled) is skipped", async () => {
    const { org, owner } = await makeOrg();
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, {
      pulse: {
        cadence: "weekly",
        anchorDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        timeZone: "UTC",
        remind: true,
        lastRemindedRound: -1,
      },
    });
    const result = await sendPulseReminders();
    expect(result).toMatchObject({ candidates: 1, sent: 0, skipped: 1 });
    expect(sendPulseReminderBatch).not.toHaveBeenCalled();
  });

  it("already reminded for this round (or later): skipped, no re-send", async () => {
    const { org, owner } = await makeOrg();
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, {
      pulse: {
        cadence: "weekly",
        anchorDate: daysAgo(2),
        timeZone: "UTC",
        remind: true,
        lastRemindedRound: 0,
      },
    });
    const result = await sendPulseReminders();
    expect(result.sent).toBe(0);
    expect(sendPulseReminderBatch).not.toHaveBeenCalled();
  });

  it("a stale round (started long ago relative to its length) is skipped", async () => {
    const { org, owner } = await makeOrg();
    // Weekly round: stale threshold is min(3 days, half of 7 days) = 3 days.
    // A round that started 5 days ago is stale.
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, {
      pulse: {
        cadence: "weekly",
        anchorDate: daysAgo(5),
        timeZone: "UTC",
        remind: true,
        lastRemindedRound: -1,
      },
    });
    const result = await sendPulseReminders();
    expect(result.sent).toBe(0);
    expect(sendPulseReminderBatch).not.toHaveBeenCalled();
  });

  it("remind:false is never selected as a candidate", async () => {
    const { org, owner } = await makeOrg();
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, {
      pulse: {
        cadence: "weekly",
        anchorDate: daysAgo(2),
        timeZone: "UTC",
        remind: false,
        lastRemindedRound: -1,
      },
    });
    const result = await sendPulseReminders();
    expect(result.candidates).toBe(0);
  });

  it("an inactive question is never selected", async () => {
    const { org, owner } = await makeOrg();
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, { isActive: false });
    const result = await sendPulseReminders();
    expect(result.candidates).toBe(0);
  });
});

describe("sendPulseReminders: recipient filters", () => {
  it("excludes muted memberships, notificationPreference:off, and unverified users", async () => {
    const { org, owner } = await makeOrg();
    const muted = await makeUser();
    await MembershipModel.create({
      organizationId: org._id,
      userId: muted._id,
      role: "MEMBER",
      notificationsMuted: true,
    });
    const off = await makeUser({ notificationPreference: "off" });
    await MembershipModel.create({ organizationId: org._id, userId: off._id, role: "MEMBER" });
    const unverified = await makeUser({ isVerified: false });
    await MembershipModel.create({ organizationId: org._id, userId: unverified._id, role: "MEMBER" });
    const good = await makeUser();
    await MembershipModel.create({ organizationId: org._id, userId: good._id, role: "MEMBER" });

    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);
    await sendPulseReminders();

    expect(sendPulseReminderBatch).toHaveBeenCalledTimes(1);
    const { recipients } = sendPulseReminderBatch.mock.calls[0][0];
    expect(new Set(recipients)).toEqual(new Set([owner.email, good.email]));
  });

  it("a team-scoped question only reminds that team's members", async () => {
    const { org, owner } = await makeOrg();
    const onTeam = await makeUser();
    await MembershipModel.create({ organizationId: org._id, userId: onTeam._id, role: "MEMBER" });
    const offTeam = await makeUser();
    await MembershipModel.create({ organizationId: org._id, userId: offTeam._id, role: "MEMBER" });
    const team = await TeamModel.create({
      organizationId: org._id,
      name: "Eng",
      slug: "eng",
      createdBy: owner._id,
      members: [onTeam._id],
    });

    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, { teamId: team._id });
    await sendPulseReminders();

    const { recipients } = sendPulseReminderBatch.mock.calls[0][0];
    expect(recipients).toEqual([onTeam.email]);
  });

  it("chunks recipients into groups of 100 with per-chunk idempotency keys", async () => {
    const { org, owner } = await makeOrg();
    for (let i = 0; i < 150; i++) {
      const u = await makeUser();
      await MembershipModel.create({ organizationId: org._id, userId: u._id, role: "MEMBER" });
    }
    const q = await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);
    await sendPulseReminders();

    expect(sendPulseReminderBatch).toHaveBeenCalledTimes(2);
    const calls = sendPulseReminderBatch.mock.calls;
    const sizes = calls.map((c) => c[0].recipients.length).sort((a, b) => b - a);
    expect(sizes).toEqual([100, 51]);
    expect(calls.map((c) => c[0].idempotencyKey).sort()).toEqual([
      `pulse:${q._id}:0:0`,
      `pulse:${q._id}:0:1`,
    ]);
  });

  it("no eligible recipients: skipped, not counted as sent, claim left in place", async () => {
    const owner = await makeUser({ notificationPreference: "off" });
    const org = await OrganizationModel.create({
      name: "Acme",
      slug: `acme-${++n}`,
      createdBy: owner._id,
      plan: "PRO",
    });
    await MembershipModel.create({ organizationId: org._id, userId: owner._id, role: "OWNER" });
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);

    const result = await sendPulseReminders();
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendPulseReminderBatch).not.toHaveBeenCalled();
  });
});

describe("sendPulseReminders: plan gating", () => {
  it("a downgraded (FREE) org gets no reminders", async () => {
    const { org, owner } = await makeOrg("FREE");
    await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);
    const result = await sendPulseReminders();
    expect(result.sent).toBe(0);
    expect(sendPulseReminderBatch).not.toHaveBeenCalled();
  });
});

describe("sendPulseReminders: send failure restores the claim", () => {
  it("restores lastRemindedRound when the (only) chunk fails", async () => {
    sendPulseReminderBatch.mockResolvedValueOnce(false);
    const { org, owner } = await makeOrg();
    const q = await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id);

    const result = await sendPulseReminders();
    expect(result).toMatchObject({ sent: 0, restored: 1 });
    const stored = await QuestionModel.findById(q._id).lean();
    expect(stored?.pulse?.lastRemindedRound).toBe(-1);
    expect(stored?.pulse?.lastRemindedAt).toBeUndefined();

    // A follow-up run can retry it from scratch.
    sendPulseReminderBatch.mockResolvedValue(true);
    const retry = await sendPulseReminders();
    expect(retry.sent).toBe(1);
  });

  it("restores to the previous round's own lastRemindedAt, not clearing it", async () => {
    const { org, owner } = await makeOrg();
    const previousRemindedAt = new Date(Date.now() - 10 * 86_400_000);
    const q = await makeDueQuestion(org._id as unknown as mongoose.Types.ObjectId, owner._id, {
      pulse: {
        cadence: "weekly",
        anchorDate: daysAgo(2),
        timeZone: "UTC",
        remind: true,
        lastRemindedRound: -1,
        lastRemindedAt: previousRemindedAt,
      },
    });
    sendPulseReminderBatch.mockResolvedValueOnce(false);
    await sendPulseReminders();
    const stored = await QuestionModel.findById(q._id).lean();
    expect(stored?.pulse?.lastRemindedRound).toBe(-1);
    expect(stored?.pulse?.lastRemindedAt?.getTime()).toBe(previousRemindedAt.getTime());
  });
});
