import { z } from "zod";

// PATCH /api/account/notifications — send any subset of the fields (at
// least one).
export const updateNotificationPreferenceSchema = z
  .object({
    notificationPreference: z.enum(["immediate", "daily", "off"]).optional(),
    // Include an AI summary in daily digest emails.
    aiDigestSummary: z.boolean().optional(),
    // Per-org mute: { [organizationId]: true (muted) | false }. The route
    // checks each id is one of the caller's memberships.
    mutedOrgs: z
      .record(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid organization id"), z.boolean())
      .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 100, {
        message: "mutedOrgs must list 1–100 organizations",
      })
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.notificationPreference !== undefined ||
      v.aiDigestSummary !== undefined ||
      v.mutedOrgs !== undefined,
    { message: "Nothing to update" }
  );

export type UpdateNotificationPreferenceRequest = z.infer<
  typeof updateNotificationPreferenceSchema
>;
