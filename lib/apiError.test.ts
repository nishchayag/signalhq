import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { apiError } from "@/lib/apiError";

function axiosErr(status: number, data: unknown) {
  const err = new AxiosError("Request failed", "ERR_BAD_REQUEST");
  err.response = { status, statusText: "", data, headers: {}, config: { headers: new AxiosHeaders() } };
  return err;
}

describe("apiError", () => {
  it("returns the server's `message` (org/question routes)", () => {
    expect(apiError(axiosErr(403, { message: "Your FREE plan allows up to 2 teams." }))).toBe(
      "Your FREE plan allows up to 2 teams."
    );
  });

  it("falls back to the server's `error` (auth routes)", () => {
    expect(apiError(axiosErr(400, { error: "Invalid OTP code" }))).toBe("Invalid OTP code");
  });

  it("uses the fallback for network errors and empty/odd bodies", () => {
    expect(apiError(new AxiosError("Network Error", "ERR_NETWORK"), "Offline?")).toBe("Offline?");
    expect(apiError(axiosErr(500, "<html>"), "Oops")).toBe("Oops");
    expect(apiError(axiosErr(500, { message: "   " }), "Oops")).toBe("Oops");
  });

  it("passes through a plain Error's message, and handles non-errors", () => {
    expect(apiError(new Error("Type the name to confirm"))).toBe("Type the name to confirm");
    expect(apiError("weird", "Fallback")).toBe("Fallback");
  });
});
