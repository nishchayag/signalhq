import { afterEach, describe, expect, it, vi } from "vitest";
import { runAfter } from "@/lib/background";

afterEach(() => vi.restoreAllMocks());

describe("runAfter", () => {
  it("runs the task outside a request scope (fallback path)", async () => {
    let resolveRan!: () => void;
    const ran = new Promise<void>((r) => (resolveRan = r));
    const task = vi.fn(async () => resolveRan());

    expect(() => runAfter(task)).not.toThrow();
    await ran;
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never throws and logs only the error name when the task fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private feedback text";

    expect(() =>
      runAfter(async () => {
        throw new TypeError(secret);
      })
    ).not.toThrow();
    // Also tolerates a task that throws synchronously.
    expect(() =>
      runAfter((() => {
        throw new RangeError(secret);
      }) as () => Promise<unknown>)
    ).not.toThrow();

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).toContain("TypeError");
    expect(printed).toContain("RangeError");
    expect(printed).not.toContain(secret);
  });
});
