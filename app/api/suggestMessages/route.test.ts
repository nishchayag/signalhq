import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { aiMock } from "@/test-utils/aiMock";
import { POST } from "@/app/api/suggestMessages/route";

beforeAll(startTestDB);
beforeEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  aiMock.reset();
});
afterAll(stopTestDB);

function signIn() {
  getServerSession.mockResolvedValue({ user: { _id: new mongoose.Types.ObjectId().toString() } });
}

describe("POST /api/suggestMessages", () => {
  it("401s with no session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("503s when AI is not configured", async () => {
    signIn();
    aiMock.disable();
    expect((await POST()).status).toBe(503);
    expect(aiMock.fns.aiText).not.toHaveBeenCalled();
  });

  it("returns the model completion on the fast tier", async () => {
    signIn();
    aiMock.setText("A?||B?||C?");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completion: "A?||B?||C?" });
    expect(aiMock.fns.aiText).toHaveBeenCalledWith(expect.objectContaining({ feature: "suggest", tier: "fast" }));
  });

  it("500s without leaking error details when the model call fails", async () => {
    signIn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    aiMock.fail("aiText");
    const res = await POST();
    expect(res.status).toBe(500);
    expect(spy.mock.calls.flat().map(String).join(" ")).toBe("[ai:suggest] AI_APICallError (status 500)");
    spy.mockRestore();
  });
});
