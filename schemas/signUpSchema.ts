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

// Letters in any script plus spaces, apostrophes, periods and hyphens —
// "José", "O'Brien", "Anne-Marie" are all real names. This is the only
// name rule (the model's old ASCII-only regex was dropped), shared by signup
// and the account name change; at signup the name also becomes the personal
// org's display name, so it stays permissive.
//
// Note: `\s` in the character class below also matches control whitespace
// (tab, newline, carriage return), so a second regex explicitly rejects
// control characters — otherwise a name like "Acme\nBcc: x@y" would slip
// through and land verbatim in the personal org's display name.
export const nameValidation = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(50, "Name is too long")
  .regex(/^[\p{L}\p{M}\s'.-]+$/u, "Name can only contain letters, spaces, apostrophes, periods and hyphens")
  .regex(/^[^\u0000-\u001F\u007F]*$/, "Name contains invalid characters");

export const signupSchema = z.object({
  username: usernameValidation,
  email: z.string().email({ message: "Invalid email address" }),
  name: nameValidation,
  password: passwordValidation,
  confirmPassword: z.string(),
});
