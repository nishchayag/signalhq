import { describe, expect, it } from "vitest";
import { updateNotificationPreferenceSchema } from "@/schemas/notificationSchema";

describe("updateNotificationPreferenceSchema", () => {
  it.each(["immediate", "daily", "off"])("accepts %s", (value) => {
    expect(
      updateNotificationPreferenceSchema.safeParse({
        notificationPreference: value,
      }).success
    ).toBe(true);
  });

  it("rejects an unrecognized value", () => {
    expect(
      updateNotificationPreferenceSchema.safeParse({
        notificationPreference: "hourly",
      }).success
    ).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(updateNotificationPreferenceSchema.safeParse({}).success).toBe(
      false
    );
  });

  it("accepts aiDigestSummary alone or with a preference", () => {
    expect(updateNotificationPreferenceSchema.safeParse({ aiDigestSummary: false }).success).toBe(true);
    expect(
      updateNotificationPreferenceSchema.safeParse({ notificationPreference: "daily", aiDigestSummary: true }).success
    ).toBe(true);
  });

  it("rejects a non-boolean aiDigestSummary and unknown keys", () => {
    expect(updateNotificationPreferenceSchema.safeParse({ aiDigestSummary: "yes" }).success).toBe(false);
    expect(updateNotificationPreferenceSchema.safeParse({ aiDigestSummary: true, extra: 1 }).success).toBe(false);
  });
});
