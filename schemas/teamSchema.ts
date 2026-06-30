import { z } from "zod";

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(2, "Team name must be at least 2 characters")
    .max(100, "Team name cannot exceed 100 characters")
    .trim(),
});

export const updateTeamSchema = z.object({
  name: z
    .string()
    .min(2, "Team name must be at least 2 characters")
    .max(100, "Team name cannot exceed 100 characters")
    .trim()
    .optional(),
  // Full replacement of the team member set (array of user ids).
  memberIds: z.array(z.string()).optional(),
});

export type CreateTeamRequest = z.infer<typeof createTeamSchema>;
export type UpdateTeamRequest = z.infer<typeof updateTeamSchema>;
