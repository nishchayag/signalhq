import z from "zod";

export const signinSchema = z.object({
  identifier: z
    .string()
    .min(4, "Identifier must be at least 4 characters long")
    .refine(
      (val) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ||
        /^[a-zA-Z0-9_]{4,20}$/.test(val),
      {
        message: "Must be a valid email or username",
      }
    ),
  // Presence only — complexity is a signup rule. Re-checking it here would
  // lock out any account created under a different (or buggy) policy.
  password: z.string().min(1, "Password is required"),
});
