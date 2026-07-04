import z from "zod";

// Usernames are lowercase-unique: normalized here (and at every DB lookup)
// rather than enforced with case-insensitive collation.
export const usernameValidation = z
  .string()
  .min(4, "Username must be at least 4 characters long")
  .max(20, "Username must be at most 20 characters long")
  .toLowerCase()
  .regex(
    /^[a-z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores"
  );

// Lookaheads only — no whitelist on the string body, so every symbol
// (#, ^, spaces, …) is allowed; any non-alphanumeric satisfies the
// special-character requirement.
export const passwordValidation = z
  .string()
  .min(8)
  .max(100)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character",
  });

export const signupSchema = z.object({
  username: usernameValidation,
  email: z.string().email({ message: "Invalid email address" }),
  name: z.string().min(1, "Name is required").max(50, "Name is too long"),
  password: passwordValidation,
  confirmPassword: z.string(),
});
