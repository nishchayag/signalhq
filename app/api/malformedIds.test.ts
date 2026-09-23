import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { GET as getQuestion } from "@/app/api/questions/[questionId]/route";
import { POST as deleteMessage } from "@/app/api/deleteMessage/route";
import { GET as getThread, POST as reply } from "@/app/api/messages/[messageId]/reply/route";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
});
afterAll(stopTestDB);

const signedIn = () =>
  getServerSession.mockResolvedValue({ user: { _id: String(new mongoose.Types.ObjectId()) } });

// Each of these used to reach findById with a junk value and 500 on a
// CastError (or, for deleteMessage, accept a query-operator object).
describe("malformed ids return 404, not 500", () => {
  it("GET /api/questions/:id", async () => {
    signedIn();
    const res = await getQuestion(new NextRequest("http://localhost/api/questions/nope"), {
      params: Promise.resolve({ questionId: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/deleteMessage with a junk id or an operator object", async () => {
    signedIn();
    for (const messageId of ["nope", { $ne: null }, 123]) {
      const res = await deleteMessage(
        new NextRequest("http://localhost/api/deleteMessage", {
          method: "POST",
          body: JSON.stringify({ messageId }),
        })
      );
      expect(res.status).toBe(404);
    }
  });

  it("GET and POST /api/messages/:id/reply", async () => {
    signedIn();
    const ctx = { params: Promise.resolve({ messageId: "nope" }) };
    expect((await getThread(new NextRequest("http://localhost/x"), ctx)).status).toBe(404);
    const res = await reply(
      new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ content: "hi" }) }),
      ctx
    );
    expect(res.status).toBe(404);
  });
});
