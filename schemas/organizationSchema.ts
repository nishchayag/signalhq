import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(80, "Organization name cannot exceed 80 characters")
    .trim(),
});

export const renameOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(80, "Organization name cannot exceed 80 characters")
    .trim(),
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
