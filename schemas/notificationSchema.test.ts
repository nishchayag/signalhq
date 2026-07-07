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
});
