import { describe, expect, it } from "vitest";
import {
  bulkMessagesSchema,
  createLabelSchema,
  patchMessageSchema,
  updateLabelSchema,
} from "@/schemas/triageSchema";

const ID = "5f0000000000000000000001";

describe("triage schemas", () => {
  it("patchMessageSchema: at least one known key", () => {
    expect(patchMessageSchema.safeParse({ read: true }).success).toBe(true);
    expect(patchMessageSchema.safeParse({ assignedTo: null }).success).toBe(true);
    expect(patchMessageSchema.safeParse({ labels: { add: [ID] } }).success).toBe(true);
    for (const bad of [{}, { x: 1 }, { labels: {} }, { labels: { add: ["x"] } }, { assignedTo: 5 }]) {
      expect(patchMessageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("bulkMessagesSchema: ids+action or scope+markAllRead", () => {
    expect(bulkMessagesSchema.safeParse({ ids: [ID], action: "archive" }).success).toBe(true);
    expect(bulkMessagesSchema.safeParse({ scope: { general: true }, action: "markAllRead" }).success).toBe(true);
    expect(bulkMessagesSchema.safeParse({ scope: { questionId: ID }, action: "markAllRead" }).success).toBe(true);
    for (const bad of [
      { ids: [ID], action: "markAllRead" },
      { scope: { general: false }, action: "markAllRead" },
      { scope: { general: true, questionId: ID }, action: "markAllRead" },
      { ids: [ID], scope: { general: true }, action: "read" },
    ]) {
      expect(bulkMessagesSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("label schemas trim, cap length and restrict colours", () => {
    expect(createLabelSchema.parse({ name: "  a ", color: "mint" })).toEqual({ name: "a", color: "mint" });
    expect(createLabelSchema.safeParse({ name: "x".repeat(25), color: "mint" }).success).toBe(false);
    expect(updateLabelSchema.safeParse({}).success).toBe(false);
    expect(updateLabelSchema.safeParse({ color: "blue" }).success).toBe(true);
  });
});
