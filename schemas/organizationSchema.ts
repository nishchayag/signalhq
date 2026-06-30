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

export type CreateOrganizationRequest = z.infer<typeof createOrganizationSchema>;
export type RenameOrganizationRequest = z.infer<typeof renameOrganizationSchema>;
