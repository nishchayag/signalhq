import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Resend throws at import time without an API key; every route here sends
// email, so mock the module and control the send result per test.
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("@/lib/mailService", () => ({
  sendEmail,
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as verifyEmail } from "@/app/api/auth/verifyEmail/route";
import { POST as resendOtp } from "@/app/api/auth/resendOtp/route";
import { identifierQuery } from "@/lib/authIdentifiers";
import UserModel from "@/models/user.model";
import OrganizationModel from "@/models/organization.model";
import MembershipModel from "@/models/membership.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(true);
});
afterAll(stopTestDB);

// Distinct IPs per call so the per-IP rate limits don't interfere across tests.
let ip = 0;
function post(path: string, body: unknown) {
  ip++;
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": `10.0.${Math.floor(ip / 250)}.${ip % 250}` },
  });
}

const valid = {
  name: "José O'Brien-Smith",
  username: "jose_ob",
  email: "Jose@Example.com",
  password: "Str0ng!pass",
  confirmPassword: "Str0ng!pass",
};

describe("POST /api/auth/signup", () => {
  it("accepts a Unicode name and creates the user plus their personal org", async () => {
    const res = await signup(post("/api/auth/signup", valid));
    expect(res.status).toBe(200);
    const user = await UserModel.findOne({ email: "jose@example.com" });
    expect(user?.name).toBe("José O'Brien-Smith");
    expect(await MembershipModel.countDocuments({ userId: user!._id, role: "OWNER" })).toBe(1);
  });

  it("enforces the schema a direct API call used to skip", async () => {
    for (const bad of [
      { ...valid, password: "weakpass" },
      { ...valid, username: "has spaces!" },
      { ...valid, email: "not-an-email" },
      { ...valid, name: "" },
    ]) {
      expect((await signup(post("/api/auth/signup", bad))).status).toBe(400);
    }
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("doesn't 500 when the verification email fails, and says so", async () => {
    sendEmail.mockResolvedValue(false);
    const res = await signup(post("/api/auth/signup", valid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.message).not.toContain("[object");
  });

  it("frees an email held by a long-expired unverified signup", async () => {
    const stale = await UserModel.create({
      name: "Old",
      username: "oldname",
      email: "jose@example.com",
      password: "x",
      isVerified: false,
      verifyCodeExpiry: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    await OrganizationModel.create({ name: "Old", slug: "old", createdBy: stale._id });

    const res = await signup(post("/api/auth/signup", valid));
    expect(res.status).toBe(200);
    expect(await UserModel.exists({ _id: stale._id })).toBeNull();
    expect(await OrganizationModel.exists({ slug: "old" })).toBeNull();
  });

  it("still 409s for an email held by a verified account", async () => {
    await UserModel.create({
      name: "Taken",
      username: "taken",
      email: "jose@example.com",
      password: "x",
      isVerified: true,
    });
    expect((await signup(post("/api/auth/signup", valid))).status).toBe(409);
  });
});

describe("POST /api/auth/verifyEmail", () => {
  it("on an expired code, removes the user AND their personal org + membership", async () => {
    await signup(post("/api/auth/signup", valid));
    const user = await UserModel.findOne({ username: "jose_ob" });
    await UserModel.updateOne({ _id: user!._id }, { verifyCodeExpiry: new Date(Date.now() - 1000) });

    const res = await verifyEmail(post("/api/auth/verifyEmail", { username: "jose_ob", otpCode: "000000" }));
    expect(res.status).toBe(400);
    expect(await UserModel.exists({ _id: user!._id })).toBeNull();
    expect(await OrganizationModel.countDocuments({ createdBy: user!._id })).toBe(0);
    expect(await MembershipModel.countDocuments({ userId: user!._id })).toBe(0);
  });

  it("caps guesses per account even when they come from different IPs", async () => {
    await signup(post("/api/auth/signup", valid));
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await verifyEmail(post("/api/auth/verifyEmail", { username: "jose_ob", otpCode: "999999" }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe("POST /api/auth/resendOtp", () => {
  it("rejects query-operator objects instead of matching an arbitrary user", async () => {
    await UserModel.create({ name: "Victim", username: "victim", email: "v@example.com", password: "x" });
    const res = await resendOtp(post("/api/auth/resendOtp", { email: { $gt: "" } }));
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("gives the same answer whether or not the account exists", async () => {
    await UserModel.create({ name: "Pending", username: "pending", email: "p@example.com", password: "x" });
    const real = await (await resendOtp(post("/api/auth/resendOtp", { email: "P@example.com" }))).json();
    const fake = await (await resendOtp(post("/api/auth/resendOtp", { email: "nobody@example.com" }))).json();
    expect(real).toEqual(fake);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("identifierQuery", () => {
  it("builds $or from only the string fields provided, lowercased", () => {
    expect(identifierQuery({ email: " A@B.com " })).toEqual({
      filter: { $or: [{ email: "a@b.com" }] },
      key: "a@b.com",
    });
    expect(identifierQuery({ email: { $gt: "" }, username: 5 })).toBeNull();
    expect(identifierQuery(null)).toBeNull();
  });
});
