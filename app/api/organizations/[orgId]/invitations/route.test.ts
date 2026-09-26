import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

const { sendInvitationEmail } = vi.hoisted(() => ({
  sendInvitationEmail: vi.fn<(payload: { acceptUrl: string }) => Promise<boolean>>(
    async () => true
  ),
}));
vi.mock("@/lib/mailService", () => ({ sendInvitationEmail }));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import { jsonReq, seedTriageWorld, sessionFor, type TriageWorld } from "@/test-utils/triageFixture";
import { POST } from "@/app/api/organizations/[orgId]/invitations/route";

type Id = mongoose.Types.ObjectId;

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  getServerSession.mockReset();
  sendInvitationEmail.mockClear();
});
afterAll(stopTestDB);

let w: TriageWorld;
beforeEach(async () => {
  w = await seedTriageWorld();
});
const as = (u: Id) => sessionFor(getServerSession, u);
const orgP = (orgId: Id = w.org) => ({ params: Promise.resolve({ orgId: String(orgId) }) });
const post = (body: unknown, orgId: Id = w.org) =>
  POST(jsonReq(`/api/organizations/${orgId}/invitations`, "POST", body), orgP(orgId));

describe("POST /api/organizations/:orgId/invitations", () => {
  it("builds the accept URL from NEXT_PUBLIC_BASE_URL via buildPublicUrl", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://signal.nishchayag.com";
    try {
      as(w.owner);
      const res = await post({ email: "invitee@example.com", role: "MEMBER" });
      expect(res.status).toBe(201);
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
      const call = sendInvitationEmail.mock.calls[0][0];
      expect(call.acceptUrl).toMatch(/^https:\/\/signal\.nishchayag\.com\/invite\/[A-Za-z0-9_-]+$/);
    } finally {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    }
  });

  it("never falls back to a hardcoded localhost:3000 URL when the env var is unset", async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    as(w.owner);
    const res = await post({ email: "invitee2@example.com", role: "MEMBER" });
    expect(res.status).toBe(201);
    const call = sendInvitationEmail.mock.calls[0][0];
    expect(call.acceptUrl).not.toContain("localhost:3000");
    expect(call.acceptUrl).toMatch(/^\/invite\//); // empty origin + path, per buildPublicUrl's server fallback
  });
});
