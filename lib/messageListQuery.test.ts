import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { buildMessageListFilter } from "@/lib/messageListQuery";
import { unreadClause } from "@/lib/readState";

const viewer = { userId: "507f1f77bcf86cd799439011", role: "OWNER" as const };
const base = { organizationId: "org1", questionId: null };
const sp = (qs: string) => new URLSearchParams(qs);
// status defaults to open: every list (incl. the CSV and semantic search)
// hides archived messages unless ?status=archived|all.
const OPEN = { archivedAt: null };
const withBase = (...and: Record<string, unknown>[]) => ({ ...base, $and: and });
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const ID = "5f0000000000000000000001";

describe("buildMessageListFilter", () => {
  it("returns base + the default open-status clause when no params are set (all modes)", () => {
    for (const mode of ["page", "export", "semantic"] as const) {
      const f = buildMessageListFilter({ base, searchParams: sp(""), viewer, mode });
      expect(f).toEqual(withBase(OPEN));
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
      ...withBase(OPEN),
      content: { $regex: "a\\.b\\(c\\)\\*", $options: "i" },
      createdAt: { $lt: new Date("2026-01-02T03:04:05.000Z") },
    });
  });

  it("trims q and ignores a blank one", () => {
    expect(buildMessageListFilter({ base, searchParams: sp("q=%20%20"), viewer })).toEqual(withBase(OPEN));
    const f = buildMessageListFilter({ base, searchParams: sp("q=%20hi%20"), viewer });
    expect(f.content).toEqual({ $regex: "hi", $options: "i" });
  });

  it("ignores an unparseable before cursor", () => {
    expect(buildMessageListFilter({ base, searchParams: sp("before=nope"), viewer })).toEqual(withBase(OPEN));
  });

  it("export mode applies q but never the cursor", () => {
    const f = buildMessageListFilter({
      base,
      searchParams: sp("q=late&before=2026-01-02T00:00:00Z"),
      viewer,
      mode: "export",
    });
    expect(f).toEqual({ ...withBase(OPEN), content: { $regex: "late", $options: "i" } });
  });

  it("semantic mode applies neither q (it's the embedding query) nor the cursor", () => {
    const f = buildMessageListFilter({
      base,
      searchParams: sp("mode=semantic&q=burnout&before=2026-01-02T00:00:00Z"),
      viewer,
      mode: "semantic",
    });
    expect(f).toEqual(withBase(OPEN));
  });

  it("never mutates base", () => {
    const b = { questionId: "q1", authorType: { $ne: "member" } };
    const snapshot = JSON.parse(JSON.stringify(b));
    buildMessageListFilter({ base: b, searchParams: sp("q=x&before=2026-01-01"), viewer });
    expect(b).toEqual(snapshot);
  });

  describe("triage params", () => {
    const f = (qs: string, mode: "page" | "export" | "semantic" = "page", v = viewer) =>
      buildMessageListFilter({ base, searchParams: sp(qs), viewer: v, mode });

    it("status: open (default, and unknown values), archived, all", () => {
      expect(f("status=open")).toEqual(withBase(OPEN));
      expect(f("status=bogus")).toEqual(withBase(OPEN));
      expect(f("status=archived")).toEqual(withBase({ archivedAt: { $ne: null } }));
      expect(f("status=all")).toEqual(base);
    });

    it("unread=1 adds the viewer's unreadClause (readSince included)", () => {
      const readSince = new Date("2026-03-01T00:00:00Z");
      const v = { ...viewer, readSince };
      expect(f("unread=1", "page", v)).toEqual(
        withBase(OPEN, unreadClause({ userId: viewer.userId, readSince }))
      );
      expect(f("unread=0")).toEqual(withBase(OPEN));
    });

    it("label: valid id narrows; a malformed id matches nothing", () => {
      expect(f(`label=${ID}`)).toEqual(withBase(OPEN, { labels: oid(ID) }));
      expect(f("label=nope")).toEqual(withBase(OPEN, { _id: { $in: [] } }));
    });

    it("assignee: me, none, <id>, malformed", () => {
      expect(f("assignee=me")).toEqual(withBase(OPEN, { assignedTo: oid(viewer.userId) }));
      expect(f("assignee=none")).toEqual(withBase(OPEN, { assignedTo: null }));
      expect(f(`assignee=${ID}`)).toEqual(withBase(OPEN, { assignedTo: oid(ID) }));
      expect(f("assignee=x")).toEqual(withBase(OPEN, { _id: { $in: [] } }));
    });

    it("apply in every mode and combine; base $and is kept first", () => {
      for (const mode of ["page", "export", "semantic"] as const) {
        const b = { ...base, $and: [{ x: 1 }] };
        const out = buildMessageListFilter({
          base: b,
          searchParams: sp(`status=all&label=${ID}&assignee=none`),
          viewer,
          mode,
        });
        expect(out.$and).toEqual([{ x: 1 }, { labels: oid(ID) }, { assignedTo: null }]);
      }
    });
  });
});
