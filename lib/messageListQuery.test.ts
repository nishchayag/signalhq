import { describe, expect, it } from "vitest";
import { buildMessageListFilter } from "@/lib/messageListQuery";

const viewer = { userId: "507f1f77bcf86cd799439011", role: "OWNER" as const };
const base = { organizationId: "org1", questionId: null };
const sp = (qs: string) => new URLSearchParams(qs);

describe("buildMessageListFilter", () => {
  it("returns a copy of base when no params are set (all modes)", () => {
    for (const mode of ["page", "export", "semantic"] as const) {
      const f = buildMessageListFilter({ base, searchParams: sp(""), viewer, mode });
      expect(f).toEqual(base);
      expect(f).not.toBe(base);
    }
  });

  it("page mode (default): escaped regex q + before cursor", () => {
    const f = buildMessageListFilter({
      base,
      searchParams: sp("q=a.b(c)*&before=2026-01-02T03:04:05.000Z"),
      viewer,
    });
    expect(f).toEqual({
      ...base,
      content: { $regex: "a\\.b\\(c\\)\\*", $options: "i" },
      createdAt: { $lt: new Date("2026-01-02T03:04:05.000Z") },
    });
  });

  it("trims q and ignores a blank one", () => {
    expect(buildMessageListFilter({ base, searchParams: sp("q=%20%20"), viewer })).toEqual(base);
    const f = buildMessageListFilter({ base, searchParams: sp("q=%20hi%20"), viewer });
    expect(f.content).toEqual({ $regex: "hi", $options: "i" });
  });

  it("ignores an unparseable before cursor", () => {
    expect(buildMessageListFilter({ base, searchParams: sp("before=nope"), viewer })).toEqual(base);
  });

  it("export mode applies q but never the cursor", () => {
    const f = buildMessageListFilter({
      base,
      searchParams: sp("q=late&before=2026-01-02T00:00:00Z"),
      viewer,
      mode: "export",
    });
    expect(f).toEqual({ ...base, content: { $regex: "late", $options: "i" } });
  });

  it("semantic mode applies neither q (it's the embedding query) nor the cursor", () => {
    const f = buildMessageListFilter({
      base,
      searchParams: sp("mode=semantic&q=burnout&before=2026-01-02T00:00:00Z"),
      viewer,
      mode: "semantic",
    });
    expect(f).toEqual(base);
  });

  it("never mutates base", () => {
    const b = { questionId: "q1", authorType: { $ne: "member" } };
    const snapshot = JSON.parse(JSON.stringify(b));
    buildMessageListFilter({ base: b, searchParams: sp("q=x&before=2026-01-01"), viewer });
    expect(b).toEqual(snapshot);
  });
});
