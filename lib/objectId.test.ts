import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { isValidObjectId } from "@/lib/objectId";

describe("isValidObjectId", () => {
  it("accepts a real ObjectId string, in either case", () => {
    const id = String(new mongoose.Types.ObjectId());
    expect(isValidObjectId(id)).toBe(true);
    expect(isValidObjectId(id.toUpperCase())).toBe(true);
  });

  it("rejects numbers, which mongoose's own isValid accepts", () => {
    expect(mongoose.Types.ObjectId.isValid(123)).toBe(true);
    expect(isValidObjectId(123)).toBe(false);
  });

  it("rejects junk, wrong lengths, and non-strings", () => {
    for (const value of ["", "undefined", "null", "zzzzzzzzzzzzzzzzzzzzzzzz", "abc", undefined, null, 123, { $gt: "" }]) {
      expect(isValidObjectId(value)).toBe(false);
    }
  });
});
