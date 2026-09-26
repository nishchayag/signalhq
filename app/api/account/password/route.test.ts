import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { POST } from "@/app/api/account/password/route";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/account/password", {
    method: "POST",
    body: JSON.stringify(body),
  });

const CURRENT = "Correct#1pass";
const NEXT = "Brand#New1pass";

async function loggedInUser() {
  const user = await UserModel.create({
    name: "Real Person",
    username: "realuser",
    email: "real@example.com",
    password: await bcrypt.hash(CURRENT, 10),
    isVerified: true,
  });
  getServerSession.mockResolvedValue({ user: { _id: String(user._id) } });
  return user;
}

describe("POST /api/account/password", () => {
  it("401s without a session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(post({ currentPassword: CURRENT, newPassword: NEXT }));
    expect(res.status).toBe(401);
  });

  it("400s a weak new password", async () => {
    const user = await loggedInUser();
    const res = await POST(post({ currentPassword: CURRENT, newPassword: "weakpass" }));
    expect(res.status).toBe(400);
    const after = await UserModel.findById(user._id);
    expect(after?.tokenVersion).toBe(0);
  });

  it("403s a wrong current password without changing anything", async () => {
    const user = await loggedInUser();
    const res = await POST(post({ currentPassword: "Wrong#1pass", newPassword: NEXT }));
    expect(res.status).toBe(403);
    const after = await UserModel.findById(user._id);
    expect(after?.tokenVersion).toBe(0);
    expect(await bcrypt.compare(CURRENT, after!.password)).toBe(true);
  });

  it("changes the password and bumps tokenVersion", async () => {
    const user = await loggedInUser();
    const res = await POST(post({ currentPassword: CURRENT, newPassword: NEXT }));
    expect(res.status).toBe(200);
    const after = await UserModel.findById(user._id);
    expect(after?.tokenVersion).toBe(1);
    expect(await bcrypt.compare(NEXT, after!.password)).toBe(true);
    expect(await bcrypt.compare(CURRENT, after!.password)).toBe(false);
  });

  it("rate-limits attempts per user", async () => {
    await loggedInUser();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await POST(post({ currentPassword: "Wrong#1pass", newPassword: NEXT }));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
  });
});
