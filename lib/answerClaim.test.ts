import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { claimResponseSlot, withResponseSlot } from "@/lib/answerClaim";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

let n = 0;
async function makeQuestion(pulse?: Record<string, unknown>) {
  n++;
  const owner = await UserModel.create({
    name: "Owner",
    username: `claimuser${n}`,
    email: `claimuser${n}@example.com`,
    password: "x".repeat(20),
    isVerified: true,
  });
  const org = await OrganizationModel.create({
    name: "Acme",
    slug: `acme-claim-${n}`,
    createdBy: owner._id,
    plan: "PRO",
  });
  return QuestionModel.create({
    questionText: "How was the offsite?",
    userId: owner._id,
    organizationId: org._id,
    slug: `claim-slug-${n}`,
    ...(pulse && { pulse: { remind: true, lastRemindedRound: -1, ...pulse } }),
  });
}

describe("claimResponseSlot: pulseOpen", () => {
  it("refuses the claim outright when pulseOpen is false, regardless of cap/close state", async () => {
    const question = await makeQuestion();
    const claimed = await claimResponseSlot(question._id, "text", new Date(), false);
    expect(claimed).toBe(false);
    const stored = await QuestionModel.findById(question._id).lean();
    expect(stored?.responseCount ?? 0).toBe(0);
  });

  it("defaults pulseOpen to true (no behavior change for non-pulse callers)", async () => {
    const question = await makeQuestion();
    const claimed = await claimResponseSlot(question._id, "text");
    expect(claimed).toBe(true);
  });
});

describe("withResponseSlot: scheduled pulse (round < 0)", () => {
  it("returns null and never calls save() for a pulse question whose first round hasn't started", async () => {
    const anchor = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const question = await makeQuestion({ cadence: "weekly", anchorDate: anchor, timeZone: "UTC" });

    let saveCalled = false;
    const result = await withResponseSlot(question, async () => {
      saveCalled = true;
      return "saved";
    });

    expect(result).toBeNull();
    expect(saveCalled).toBe(false);
    const stored = await QuestionModel.findById(question._id).lean();
    expect(stored?.responseCount ?? 0).toBe(0);
  });

  it("claims normally once the pulse's first round has opened", async () => {
    const question = await makeQuestion({ cadence: "weekly", anchorDate: "2020-01-01", timeZone: "UTC" });

    const result = await withResponseSlot(question, async () => "saved");
    expect(result).toBe("saved");
    const stored = await QuestionModel.findById(question._id).lean();
    expect(stored?.responseCount).toBe(1);
  });

  it("a non-pulse question is unaffected", async () => {
    const question = await makeQuestion();
    const result = await withResponseSlot(question, async () => "saved");
    expect(result).toBe("saved");
  });
});
