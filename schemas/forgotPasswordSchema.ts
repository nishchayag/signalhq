import z from "zod";
import { passwordValidation } from "./signUpSchema";

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  otpCode: z
    .string()
    .length(6, { message: "Code must be exactly 6 digits long" })
    .regex(/^\d+$/, { message: "Code must contain only digits" }),
  newPassword: passwordValidation,
});
