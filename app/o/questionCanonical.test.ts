import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

// next/navigation's notFound/permanentRedirect throw to abort rendering;
// the mocks throw recognisable errors so the tests can assert on them.
const { notFound, permanentRedirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:308:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ notFound, permanentRedirect }));
vi.mock("@/components/QuestionResponseForm", () => ({
  default: function QuestionResponseForm() {
    return null;
  },
}));
vi.mock("@/lib/mailService", () => ({
  sendEmail: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import OrgQuestionPage, { generateMetadata } from "@/app/o/[orgSlug]/q/[slug]/page";
import LegacyQuestionPage from "@/app/q/[slug]/page";
import QuestionResponseForm from "@/components/QuestionResponseForm";
import { POST as submitAnswer } from "@/app/api/questions/submit/[slug]/route";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";
import MessageModel from "@/models/message.model";

beforeAll(startTestDB);
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  await clearTestDB();
  notFound.mockClear();
  permanentRedirect.mockClear();
});
afterAll(stopTestDB);

let orgA: unknown;
const ownerId = new mongoose.Types.ObjectId();

beforeEach(async () => {
  orgA = (await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: ownerId }))._id;
  await OrganizationModel.create({ name: "Globex", slug: "globex", createdBy: new mongoose.Types.ObjectId() });
  await QuestionModel.create({
    questionText: "How was the offsite?",
    userId: ownerId,
    organizationId: orgA,
    slug: "q1abcdef",
  });
});

const orgPage = (orgSlug: string, slug: string) =>
  OrgQuestionPage({ params: Promise.resolve({ orgSlug, slug }) });
const legacyPage = (slug: string) => LegacyQuestionPage({ params: Promise.resolve({ slug }) });

describe("/o/[orgSlug]/q/[slug]", () => {
  it("renders the form under the question's own org", async () => {
    const el = (await orgPage("acme", "q1abcdef")) as React.ReactElement<{ slug: string }>;
    expect(el.type).toBe(QuestionResponseForm);
    expect(el.props.slug).toBe("q1abcdef");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("permanently redirects a wrong-org URL to the canonical one", async () => {
    await expect(orgPage("globex", "q1abcdef")).rejects.toThrow("NEXT_REDIRECT:308:/o/acme/q/q1abcdef");
  });

  it("redirects a nonexistent org segment too, rather than rendering under it", async () => {
    await expect(orgPage("nope", "q1abcdef")).rejects.toThrow("NEXT_REDIRECT:308:/o/acme/q/q1abcdef");
  });

  it("normalises slug casing to the canonical URL", async () => {
    await expect(orgPage("acme", "Q1ABCDEF")).rejects.toThrow("NEXT_REDIRECT:308:/o/acme/q/q1abcdef");
  });

  it("404s an unknown slug", async () => {
    await expect(orgPage("acme", "missing1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("404s a question whose org no longer exists", async () => {
    await OrganizationModel.deleteOne({ _id: orgA });
    await expect(orgPage("acme", "q1abcdef")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("metadata uses the canonical URL and never the URL's org", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ orgSlug: "globex", slug: "q1abcdef" }) });
    const serialized = JSON.stringify(meta);
    expect(serialized).toContain("/o/acme/q/q1abcdef");
    expect(serialized).not.toContain("globex");
    expect(serialized).toContain("How was the offsite?");
  });

  it("metadata for an unknown slug is a generic not-found", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ orgSlug: "globex", slug: "missing1" }) });
    expect(JSON.stringify(meta)).not.toContain("globex");
    expect(String(meta.title)).toContain("not found");
  });

  it("metadata hides an internal question's wording", async () => {
    await QuestionModel.updateOne({ slug: "q1abcdef" }, { visibility: "internal" });
    const meta = await generateMetadata({ params: Promise.resolve({ orgSlug: "acme", slug: "q1abcdef" }) });
    expect(JSON.stringify(meta)).not.toContain("How was the offsite?");
  });
});

describe("legacy /q/[slug]", () => {
  it("permanently redirects to the canonical org URL", async () => {
    await expect(legacyPage("q1abcdef")).rejects.toThrow("NEXT_REDIRECT:308:/o/acme/q/q1abcdef");
  });

  it("404s an unknown slug", async () => {
    await expect(legacyPage("missing1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a question with no org", async () => {
    await QuestionModel.updateOne({ slug: "q1abcdef" }, { $unset: { organizationId: 1 } });
    await expect(legacyPage("q1abcdef")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("question submit API", () => {
  it("stamps the question's own organizationId (no org segment is accepted)", async () => {
    const res = await submitAnswer(
      new NextRequest("http://localhost/api/questions/submit/q1abcdef", {
        method: "POST",
        body: JSON.stringify({ content: "Great offsite, thanks", organizationId: "000000000000000000000000" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8.7" },
      }),
      { params: Promise.resolve({ slug: "q1abcdef" }) }
    );
    expect(res.status).toBe(201);
    const msg = await MessageModel.findOne({});
    expect(String(msg!.organizationId)).toBe(String(orgA));
  });
});
