import { z } from "zod";

// Owners cannot be assigned via this endpoint — ownership transfer is a
// separate, deliberate action. Admins may only set ADMIN/MEMBER.
export const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleSchema>;
