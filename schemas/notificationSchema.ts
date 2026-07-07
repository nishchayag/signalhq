import { z } from "zod";

export const updateNotificationPreferenceSchema = z.object({
  notificationPreference: z.enum(["immediate", "daily", "off"]),
});

export type UpdateNotificationPreferenceRequest = z.infer<
  typeof updateNotificationPreferenceSchema
>;
