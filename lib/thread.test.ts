import { describe, expect, it } from "vitest";
import { lastOrgTurn, lastTurn, threadOf } from "@/lib/thread";

const t = (iso: string) => new Date(iso);

describe("threadOf", () => {
  it("synthesizes turn 1 as sender for anonymous and member for member threads", () => {
    expect(threadOf({ content: "hi", createdAt: t("2026-01-01T00:00:00Z") })).toEqual([
      { authorRole: "sender", content: "hi", createdAt: t("2026-01-01T00:00:00Z") },
    ]);
    expect(
      threadOf({ content: "hi", createdAt: "2026-01-01T00:00:00Z", authorType: "member" })[0].authorRole
    ).toBe("member");
  });

  it("orders replies by time", () => {
    const turns = threadOf({
      content: "first",
      createdAt: t("2026-01-01T00:00:00Z"),
      replies: [
        { authorRole: "sender", content: "later", createdAt: t("2026-01-04T00:00:00Z") },
        { authorRole: "org", content: "earlier", createdAt: t("2026-01-02T00:00:00Z") },
        { authorRole: "org", content: "middle", createdAt: t("2026-01-03T00:00:00Z") },
      ],
    });
    expect(turns.map((x) => `${x.authorRole}:${x.content}`)).toEqual([
      "sender:first",
      "org:earlier",
      "org:middle",
      "sender:later",
    ]);
  });

  it("lastOrgTurn returns the newest org turn, never turn 1", () => {
    const src = {
      content: "first",
      createdAt: t("2026-01-01T00:00:00Z"),
      replies: [
        { authorRole: "org", content: "a", createdAt: t("2026-01-02T00:00:00Z") },
        { authorRole: "org", content: "b", createdAt: t("2026-01-03T00:00:00Z") },
        { authorRole: "sender", content: "c", createdAt: t("2026-01-04T00:00:00Z") },
      ],
    };
    expect(lastOrgTurn(src)?.content).toBe("b");
    expect(lastOrgTurn({ content: "x", createdAt: t("2026-01-01T00:00:00Z") })).toBeNull();
  });

  it("lastTurn returns the newest turn overall, including a sender follow-up", () => {
    const src = {
      content: "first",
      createdAt: t("2026-01-01T00:00:00Z"),
      replies: [
        { authorRole: "org", content: "a", createdAt: t("2026-01-02T00:00:00Z") },
        { authorRole: "sender", content: "b", createdAt: t("2026-01-03T00:00:00Z") },
      ],
    };
    expect(lastTurn(src)?.content).toBe("b");
    expect(lastTurn({ content: "x", createdAt: t("2026-01-01T00:00:00Z") })).toBeNull();
  });
});
