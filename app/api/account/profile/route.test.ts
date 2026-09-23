import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { PATCH } from "@/app/api/account/profile/route";
import UserModel from "@/models/user.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

async function loggedInUser() {
  const user = await UserModel.create({
    name: "Old Name",
    username: "realuser",
    email: "real@example.com",
    password: "x",
    isVerified: true,
  });
  getServerSession.mockResolvedValue({ user: { _id: String(user._id) } });
  return user;
}

describe("PATCH /api/account/profile", () => {
  it("401s without a session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await PATCH(patch({ name: "Anyone" }));
    expect(res.status).toBe(401);
  });

  it("400s an invalid name and leaves the DB alone", async () => {
    const user = await loggedInUser();
    for (const name of ["", "   ", "Robert'); DROP", "x".repeat(51), 42]) {
      const res = await PATCH(patch({ name }));
      expect(res.status, JSON.stringify(name)).toBe(400);
    }
    expect((await UserModel.findById(user._id))?.name).toBe("Old Name");
  });

  it("updates the name (trimmed, Unicode allowed)", async () => {
    const user = await loggedInUser();
    const res = await PATCH(patch({ name: "  José O'Brien-Smith " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, name: "José O'Brien-Smith" });
    const after = await UserModel.findById(user._id);
    expect(after?.name).toBe("José O'Brien-Smith");
    expect(after?.username).toBe("realuser");
  });
});
