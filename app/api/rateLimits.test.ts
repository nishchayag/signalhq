import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as checkUsername } from "@/app/api/auth/checkUsernameUnique/route";
import { POST as createOrg } from "@/app/api/organizations/route";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

describe("GET /api/auth/checkUsernameUnique", () => {
  it("allows 30 checks a minute per IP, then 429s", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await checkUsername(
        new NextRequest(`http://localhost/api/auth/checkUsernameUnique?username=name${i}x`, {
          headers: { "x-forwarded-for": "10.9.9.9" },
        })
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("matches case-insensitively (usernames are stored lowercase)", async () => {
    await UserModel.create({ name: "Taken", username: "takenname", email: "t@x.com", password: "x" });
    const res = await checkUsername(
      new NextRequest("http://localhost/api/auth/checkUsernameUnique?username=TakenName", {
        headers: { "x-forwarded-for": "10.9.9.10" },
      })
    );
    expect((await res.json()).success).toBe(false);
  });
});

describe("POST /api/organizations", () => {
  it("caps a user at 10 new orgs an hour", async () => {
    getServerSession.mockResolvedValue({ user: { _id: String(new mongoose.Types.ObjectId()) } });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await createOrg(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({ name: `Org number ${i}` }),
        })
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
