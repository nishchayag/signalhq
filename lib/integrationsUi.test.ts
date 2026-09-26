import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  deliveryStatusInfo,
  integrationErrorMessage,
  relativeTimeFrom,
} from "@/lib/integrationsUi";
import { INTEGRATION_MAX_PER_ORG } from "@/lib/integrationConstants";

function axiosErr(status: number, data: unknown) {
  const err = new AxiosError("Request failed", "ERR_BAD_REQUEST");
  err.response = { status, statusText: "", data, headers: {}, config: { headers: new AxiosHeaders() } };
  return err;
}

describe("integrationErrorMessage", () => {
  it("maps 400 URL_NOT_ALLOWED", () => {
    expect(integrationErrorMessage(axiosErr(400, { code: "URL_NOT_ALLOWED" }), "fallback")).toBe(
      "That URL isn't allowed. Use a public https URL (Slack: hooks.slack.com)."
    );
  });

  it("maps 409 LIMIT with the real per-org cap", () => {
    expect(integrationErrorMessage(axiosErr(409, { code: "LIMIT" }), "fallback")).toBe(
      `You can have up to ${INTEGRATION_MAX_PER_ORG} integrations.`
    );
  });

  it("maps 503 INTEGRATIONS_UNAVAILABLE", () => {
    expect(integrationErrorMessage(axiosErr(503, { code: "INTEGRATIONS_UNAVAILABLE" }), "fallback")).toBe(
      "Integrations aren't configured on this server yet."
    );
  });

  it("maps 403 PLAN_UPGRADE_REQUIRED, preferring the server's message", () => {
    expect(
      integrationErrorMessage(
        axiosErr(403, { code: "PLAN_UPGRADE_REQUIRED", message: "Upgrade to Pro." }),
        "fallback"
      )
    ).toBe("Upgrade to Pro.");
    expect(integrationErrorMessage(axiosErr(403, { code: "PLAN_UPGRADE_REQUIRED" }), "fallback")).toBe(
      "Integrations are available on the Pro plan and up."
    );
  });

  it("falls back to apiError's generic message/error handling otherwise", () => {
    expect(integrationErrorMessage(axiosErr(400, { message: "Invalid input" }), "fallback")).toBe(
      "Invalid input"
    );
    expect(integrationErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(integrationErrorMessage("weird", "fallback")).toBe("fallback");
  });
});

describe("deliveryStatusInfo", () => {
  it("reports no deliveries yet when lastStatus is null", () => {
    expect(deliveryStatusInfo(null, null)).toEqual({ text: "No deliveries yet", tone: "neutral" });
  });

  it("reports success", () => {
    expect(deliveryStatusInfo("ok", 200)).toEqual({ text: "Delivered OK", tone: "success" });
  });

  it("reports an HTTP error with its code", () => {
    expect(deliveryStatusInfo("fail", 500)).toEqual({ text: "HTTP error (500)", tone: "danger" });
    expect(deliveryStatusInfo("fail", 429)).toEqual({ text: "HTTP error (429)", tone: "danger" });
  });

  it("reports an unreachable target when there's no HTTP status", () => {
    expect(deliveryStatusInfo("fail", null)).toEqual({
      text: "Couldn't reach the target",
      tone: "danger",
    });
  });
});

describe("relativeTimeFrom", () => {
  const now = new Date("2026-09-26T12:00:00.000Z");

  it("collapses very recent times to 'just now'", () => {
    expect(relativeTimeFrom(new Date("2026-09-26T11:59:30.000Z"), now)).toBe("just now");
  });

  it("formats minutes, hours and days ago", () => {
    expect(relativeTimeFrom(new Date("2026-09-26T11:55:00.000Z"), now)).toBe("5 minutes ago");
    expect(relativeTimeFrom(new Date("2026-09-26T09:00:00.000Z"), now)).toBe("3 hours ago");
    expect(relativeTimeFrom(new Date("2026-09-24T12:00:00.000Z"), now)).toBe("2 days ago");
  });

  it("accepts an ISO string for `at`", () => {
    expect(relativeTimeFrom("2026-09-26T11:00:00.000Z", now)).toBe("1 hour ago");
  });
});
