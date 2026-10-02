import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import type { ReactElement } from "react";

// next/navigation's notFound() throws to abort rendering — the mock throws
// a recognisable error so the tests can assert on it, same pattern as
// app/o/questionCanonical.test.ts. permanentRedirect is also mocked (and
// asserted never called) even though neither embed page imports it, to
// pin down "an embed page never redirects" at the test level too.
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
vi.mock("@/components/OrgFeedbackForm", () => ({
  default: function OrgFeedbackForm() {
    return null;
  },
}));

import { startTestDB, clearTestDB, stopTestDB } from "@/test-utils/db";
import EmbedQuestionPage, { generateMetadata as questionMetadata } from "@/app/embed/q/[slug]/page";
import EmbedOrgPage from "@/app/embed/o/[orgSlug]/page";
import QuestionResponseForm from "@/components/QuestionResponseForm";
import OrgFeedbackForm from "@/components/OrgFeedbackForm";
import OrganizationModel from "@/models/organization.model";
import QuestionModel from "@/models/question.model";

beforeAll(startTestDB);
afterEach(async () => {
  await clearTestDB();
  notFound.mockClear();
  permanentRedirect.mockClear();
});
afterAll(stopTestDB);

const ownerId = new mongoose.Types.ObjectId();
let orgId: unknown;

beforeEach(async () => {
  orgId = (await OrganizationModel.create({ name: "Acme", slug: "acme", createdBy: ownerId }))._id;
  await QuestionModel.create({
    questionText: "How was the offsite?",
    userId: ownerId,
    organizationId: orgId,
    slug: "q1abcdef",
  });
  await QuestionModel.create({
    questionText: "Internal eng retro notes",
    userId: ownerId,
    organizationId: orgId,
    slug: "q2intern",
    visibility: "internal",
  });
});

/** Depth-first search for the first element of the given component type
 * inside a page's returned element tree (which may be a bare element, a
 * Fragment, or a host element with nested children arrays). */
function findElement(node: unknown, type: unknown): ReactElement | null {
  if (!node || typeof node !== "object") return null;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === type) return el;
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, type);
      if (found) return found;
    }
  } else if (children) {
    const found = findElement(children, type);
    if (found) return found;
  }
  return null;
}

/**
 * Collects every string found under `props.href` or `props.children` across
 * the tree. Deliberately narrow (not a generic JSON.stringify of the whole
 * element tree): React elements carry internal `_owner`/`_store` dev fields
 * that reference back into the fiber tree, and lucide-react icon components
 * are themselves circular objects — walking every prop key crashes on
 * "Converting circular structure to JSON" without being any more thorough
 * for what these assertions actually need (link targets and link text).
 */
function collectStrings(node: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out, seen);
    return out;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  const props = el.props;
  if (props && typeof props === "object") {
    collectStrings((props as Record<string, unknown>).href, out, seen);
    collectStrings((props as Record<string, unknown>).children, out, seen);
  }
  return out;
}

const questionPage = (slug: string) => EmbedQuestionPage({ params: Promise.resolve({ slug }) });
const orgPage = (orgSlug: string, theme?: string) =>
  EmbedOrgPage({
    params: Promise.resolve({ orgSlug }),
    searchParams: Promise.resolve(theme ? { theme } : {}),
  });

describe("/embed/q/[slug]", () => {
  it("404s an unknown slug", async () => {
    await expect(questionPage("missing1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("404s an internal question (never leaks its wording)", async () => {
    await expect(questionPage("q2intern")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the embeddable form for a public question, in embed mode, without redirecting", async () => {
    const tree = await questionPage("q1abcdef");
    expect(notFound).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
    const formEl = findElement(tree, QuestionResponseForm) as ReactElement<{
      slug: string;
      embed?: boolean;
    }> | null;
    expect(formEl).not.toBeNull();
    expect(formEl!.props.slug).toBe("q1abcdef");
    expect(formEl!.props.embed).toBe(true);
  });

  it("metadata hides an internal question's wording and is noindex,nofollow", async () => {
    const meta = await questionMetadata({ params: Promise.resolve({ slug: "q2intern" }) });
    expect(JSON.stringify(meta)).not.toContain("Internal eng retro notes");
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("metadata for a public question is noindex,nofollow but keeps its title", async () => {
    const meta = await questionMetadata({ params: Promise.resolve({ slug: "q1abcdef" }) });
    expect(String(meta.title)).toContain("How was the offsite?");
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });
});

describe("/embed/o/[orgSlug]", () => {
  it("404s an unknown org", async () => {
    await expect(orgPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("renders the embeddable org form in embed mode, without redirecting", async () => {
    const tree = await orgPage("acme");
    expect(notFound).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
    const formEl = findElement(tree, OrgFeedbackForm) as ReactElement<{
      orgSlug: string;
      embed?: boolean;
    }> | null;
    expect(formEl).not.toBeNull();
    expect(formEl!.props.orgSlug).toBe("acme");
    expect(formEl!.props.embed).toBe(true);
  });

  it("only links to /embed/q/* for its questions, never /o/*", async () => {
    const tree = await orgPage("acme");
    const strings = collectStrings(tree);
    expect(strings).toContain("/embed/q/q1abcdef");
    expect(strings.some((s) => s.startsWith("/o/"))).toBe(false);
  });

  it("never lists an internal question", async () => {
    const tree = await orgPage("acme");
    const strings = collectStrings(tree);
    expect(strings.some((s) => s.includes("q2intern"))).toBe(false);
  });

  it("keeps ?theme= on the question links when present", async () => {
    const tree = await orgPage("acme", "dark");
    const strings = collectStrings(tree);
    expect(strings).toContain("/embed/q/q1abcdef?theme=dark");
  });
});
