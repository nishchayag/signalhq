import { z } from "zod";

// PATCH /api/account/notifications — either field (or both) may be sent.
export const updateNotificationPreferenceSchema = z
  .object({
    notificationPreference: z.enum(["immediate", "daily", "off"]).optional(),
    // Include an AI summary in daily digest emails.
    aiDigestSummary: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.notificationPreference !== undefined || v.aiDigestSummary !== undefined,
    { message: "Nothing to update" }
  );

export type UpdateNotificationPreferenceRequest = z.infer<
  typeof updateNotificationPreferenceSchema
>;
