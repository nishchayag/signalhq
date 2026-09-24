import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { aiMock } from "@/test-utils/aiMock";
import { GET, PATCH } from "@/app/api/account/notifications/route";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
beforeEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  aiMock.reset();
});
afterAll(stopTestDB);

async function signedInUser(overrides: Record<string, unknown> = {}) {
  const user = await UserModel.create({
    name: "N",
    username: "notifuser",
    email: "notifuser@example.com",
    password: "x",
    isVerified: true,
    ...overrides,
  });
  getServerSession.mockResolvedValue({ user: { _id: String(user._id) } });
  return user;
}

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/account/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
  }));

describe("/api/account/notifications", () => {
  it("401s without a session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await patch({ aiDigestSummary: false })).status).toBe(401);
  });

  it("GET returns the preference, aiDigestSummary (default true) and aiAvailable", async () => {
    await signedInUser();
    expect(await (await GET()).json()).toEqual({
      success: true,
      notificationPreference: "daily",
      aiDigestSummary: true,
      aiAvailable: true,
    });
    aiMock.disable();
    expect((await (await GET()).json()).aiAvailable).toBe(false);
  });

  it("PATCH updates aiDigestSummary alone without touching the preference", async () => {
    const user = await signedInUser({ notificationPreference: "immediate" });
    expect((await patch({ aiDigestSummary: false })).status).toBe(200);
    const fresh = await UserModel.findById(user._id);
    expect(fresh.aiDigestSummary).toBe(false);
    expect(fresh.notificationPreference).toBe("immediate");
    expect((await (await GET()).json()).aiDigestSummary).toBe(false);
  });

  it("PATCH updates the preference alone without touching aiDigestSummary", async () => {
    const user = await signedInUser({ aiDigestSummary: false });
    expect((await patch({ notificationPreference: "off" })).status).toBe(200);
    const fresh = await UserModel.findById(user._id);
    expect(fresh.notificationPreference).toBe("off");
    expect(fresh.aiDigestSummary).toBe(false);
  });

  it("PATCH 400s an empty or invalid body", async () => {
    await signedInUser();
    expect((await patch({})).status).toBe(400);
    expect((await patch({ aiDigestSummary: "no" })).status).toBe(400);
  });
});
