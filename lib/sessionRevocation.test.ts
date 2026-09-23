import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";

vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import authOptions from "@/lib/nextAuthOptions";
import { SESSION_REVOKED } from "@/lib/sessionRevocation";
import { POST as resetPassword } from "@/app/api/auth/resetPassword/route";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(clearTestDB);
afterAll(stopTestDB);

type JwtArgs = { token: JWT; user?: unknown; trigger?: "signIn" | "update"; session?: unknown };
const jwt = authOptions.callbacks!.jwt as unknown as (args: JwtArgs) => Promise<JWT>;

async function makeUser(extra: Record<string, unknown> = {}) {
  return UserModel.create({
    name: "Real Person",
    username: "realuser",
    email: "real@example.com",
    password: await bcrypt.hash("Correct#1pass", 10),
    isVerified: true,
    ...extra,
  });
}

async function signIn() {
  const user = await makeUser();
  const token = await jwt({ token: {}, user, trigger: "signIn" });
  return { user, token };
}

describe("jwt callback — tokenVersion revocation", () => {
  it("stamps the user's tokenVersion at sign-in", async () => {
    const user = await makeUser({ tokenVersion: 3 });
    const token = await jwt({ token: {}, user, trigger: "signIn" });
    expect(token._id).toBe(String(user._id));
    expect(token.tokenVersion).toBe(3);
  });

  it("passes a token whose version still matches", async () => {
    const { token } = await signIn();
    expect(token.tokenVersion).toBe(0);
    const again = await jwt({ token: { ...token } });
    expect(again._id).toBe(token._id);
  });

  it("treats a missing tokenVersion on the user doc as 0", async () => {
    const { user, token } = await signIn();
    await UserModel.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: "" } });
    await expect(jwt({ token: { ...token } })).resolves.toMatchObject({ _id: token._id });
    // …and a legacy token without the field matches a version-0 user.
    const { tokenVersion: _drop, ...legacy } = token;
    void _drop;
    await expect(jwt({ token: legacy })).resolves.toMatchObject({ _id: token._id });
  });

  it("throws once the user's tokenVersion is bumped", async () => {
    const { user, token } = await signIn();
    await UserModel.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await expect(jwt({ token: { ...token } })).rejects.toThrow(SESSION_REVOKED);
  });

  it("throws when the user no longer exists", async () => {
    const { user, token } = await signIn();
    await UserModel.deleteOne({ _id: user._id });
    await expect(jwt({ token: { ...token } })).rejects.toThrow(SESSION_REVOKED);
  });

  it("re-reads name and email from the DB on update, ignoring the payload", async () => {
    const { user, token } = await signIn();
    await UserModel.updateOne({ _id: user._id }, { name: "New Name" });
    const updated = await jwt({
      token: { ...token, email: "real@example.com" },
      trigger: "update",
      session: { name: "Forged", email: "forged@example.com" },
    });
    expect(updated.name).toBe("New Name");
    expect(updated.email).toBe("real@example.com");
  });
});

describe("POST /api/auth/resetPassword", () => {
  it("bumps tokenVersion so existing sessions die", async () => {
    const user = await makeUser({
      tokenVersion: 2,
      forgotPasswordCode: "123456",
      forgotPasswordCodeExpiry: new Date(Date.now() + 60_000),
    });
    const res = await resetPassword(
      new NextRequest("http://localhost/api/auth/resetPassword", {
        method: "POST",
        body: JSON.stringify({
          email: "real@example.com",
          otpCode: "123456",
          newPassword: "Brand#New1pass",
        }),
        headers: { "x-forwarded-for": "10.9.0.1" },
      })
    );
    expect(res.status).toBe(200);
    const after = await UserModel.findById(user._id);
    expect(after?.tokenVersion).toBe(3);
    expect(await bcrypt.compare("Brand#New1pass", after!.password)).toBe(true);
  });
});
