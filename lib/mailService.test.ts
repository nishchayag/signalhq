import { beforeEach, describe, expect, it, vi } from "vitest";

type SendPayload = {
  subject: string;
  text?: string;
  headers?: Record<string, string>;
};

const { send } = vi.hoisted(() => ({
  send: vi.fn<(payload: SendPayload) => Promise<{ data: { id: string }; error: null }>>(
    async () => ({ data: { id: "email_1" }, error: null })
  ),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

vi.mock("@/lib/connectDB", () => ({ default: vi.fn(async () => {}) }));

const { findOne } = vi.hoisted(() => ({
  findOne: vi.fn(async () => ({ name: "Sam" })),
}));
vi.mock("@/models/user.model", () => ({ default: { findOne } }));

import { sendEmail, sendInvitationEmail, sendNotificationEmail } from "@/lib/mailService";

beforeEach(() => {
  send.mockClear();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  findOne.mockClear();
  findOne.mockResolvedValue({ name: "Sam" });
});

describe("sendInvitationEmail", () => {
  it("strips a newline injected into the org name from the subject", async () => {
    await sendInvitationEmail({
      email: "invitee@example.com",
      orgName: "Acme\nBcc: attacker@evil.example",
      role: "MEMBER",
      acceptUrl: "https://example.test/invite/tok",
    });
    const call = send.mock.calls[0][0];
    expect(call.subject).toBe("You've been invited to join Acme Bcc: attacker@evil.example on SignalHQ");
    expect(call.subject).not.toMatch(/[\r\n]/);
  });

  it("collapses tabs and control characters too, and trims the result", async () => {
    await sendInvitationEmail({
      email: "invitee@example.com",
      orgName: "\tAcme\u0000Corp\r\n",
      role: "MEMBER",
      acceptUrl: "https://example.test/invite/tok",
    });
    const call = send.mock.calls[0][0];
    expect(call.subject).toBe("You've been invited to join Acme Corp on SignalHQ");
  });

  it("includes a plain-text alternative with the accept link", async () => {
    await sendInvitationEmail({
      email: "invitee@example.com",
      orgName: "Acme",
      role: "MEMBER",
      acceptUrl: "https://example.test/invite/tok",
    });
    const call = send.mock.calls[0][0];
    expect(typeof call.text).toBe("string");
    expect(call.text).toContain("https://example.test/invite/tok");
    expect(call.headers).toBeUndefined();
  });
});

describe("sendNotificationEmail", () => {
  it("sets the List-Unsubscribe header to the settings URL and includes a text part", async () => {
    await sendNotificationEmail({
      email: "user@example.com",
      name: "Sam",
      count: 2,
      dashboardUrl: "https://example.test/dashboard",
      settingsUrl: "https://example.test/dashboard/account#notifications",
    });
    const call = send.mock.calls[0][0];
    expect(call.headers).toEqual({
      "List-Unsubscribe": "<https://example.test/dashboard/account#notifications>",
    });
    expect(typeof call.text).toBe("string");
    expect(call.text).toContain("2");
  });
});

describe("sendEmail", () => {
  it("includes the OTP code in the plain-text alternative", async () => {
    await sendEmail({ email: "user@example.com", mailType: "VERIFY", otpCode: "123456" });
    const call = send.mock.calls[0][0];
    expect(typeof call.text).toBe("string");
    expect(call.text).toContain("123456");
    expect(call.headers).toBeUndefined();
  });
});
