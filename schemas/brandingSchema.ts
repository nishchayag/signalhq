import { z } from "zod";
import { BRANDING_ACCENTS, WELCOME_TEXT_MAX } from "@/lib/brandingConstants";

// PATCH /api/organizations/:orgId/branding — any subset, at least one key.
// welcomeText: "" is allowed (clears it); moderation runs in the route
// (schemas don't have access to lib/contentModeration.ts's stateful matcher
// and the route needs to distinguish "invalid shape" 400s from "moderated"
// 400s anyway).
export const patchBrandingSchema = z
  .object({
    accent: z.enum(BRANDING_ACCENTS).optional(),
    welcomeText: z
      .string()
      .trim()
      .max(WELCOME_TEXT_MAX, `Welcome text cannot exceed ${WELCOME_TEXT_MAX} characters`)
      .optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

export type PatchBrandingRequest = z.infer<typeof patchBrandingSchema>;
