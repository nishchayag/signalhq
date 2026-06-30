import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z.string().email("Please enter a valid email address").trim(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  // Optional team to add the invitee to on acceptance.
  teamId: z.string().optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>;
