import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withErrorHandling } from "@/lib/apiHandler";

const req = () => new NextRequest("http://localhost/api/test", { method: "POST" });
const ctx = { params: Promise.resolve({ orgId: "x" }) };

describe("withErrorHandling", () => {
  it("passes a normal response through untouched", async () => {
    const handler = withErrorHandling(async () => NextResponse.json({ ok: 1 }, { status: 201 }));
    const res = await handler(req(), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it("hands the route context through to the handler", async () => {
    const handler = withErrorHandling(async (_r, c: typeof ctx) => {
      const { orgId } = await c.params;
      return NextResponse.json({ orgId });
    });
    expect(await (await handler(req(), ctx)).json()).toEqual({ orgId: "x" });
  });

  it("maps a malformed JSON body (SyntaxError) to 400", async () => {
    const handler = withErrorHandling(async (r: NextRequest) => {
      await r.json();
      return NextResponse.json({});
    });
    const bad = new NextRequest("http://localhost/api/test", { method: "POST", body: "{not json" });
    expect((await handler(bad, ctx)).status).toBe(400);
  });

  it("maps a Mongoose CastError to 404", async () => {
    const handler = withErrorHandling(async () => {
      throw new mongoose.Error.CastError("ObjectId", "nope", "_id");
    });
    expect((await handler(req(), ctx)).status).toBe(404);
  });

  it("maps anything else to a JSON 500 and logs it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorHandling(async () => {
      throw new Error("boom");
    });
    const res = await handler(req(), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, message: "Internal server error" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
