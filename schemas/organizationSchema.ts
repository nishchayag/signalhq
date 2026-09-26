import { z } from "zod";

// Org names get interpolated into email subjects (invitation emails) and
// shown in dashboards, so control characters — including CR/LF, which could
// inject extra header lines into a subject — are rejected outright rather
// than stripped. Unicode letters, symbols and emoji are otherwise unrestricted.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const organizationNameSchema = z
  .string()
  .min(2, "Organization name must be at least 2 characters")
  .max(80, "Organization name cannot exceed 80 characters")
  .trim()
  .refine((name) => !CONTROL_CHARS.test(name), {
    message: "Organization name contains invalid characters",
  });

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export const renameOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export const updatePlanSchema = z.object({
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
});

export const transferOwnershipSchema = z.object({
  membershipId: z.string().min(1, "membershipId is required"),
});

export type CreateOrganizationRequest = z.infer<typeof createOrganizationSchema>;
export type RenameOrganizationRequest = z.infer<typeof renameOrganizationSchema>;
export type UpdatePlanRequest = z.infer<typeof updatePlanSchema>;
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipSchema>;
