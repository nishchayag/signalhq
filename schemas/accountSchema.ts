import z from "zod";
import { nameValidation, passwordValidation } from "./signUpSchema";

export const updateProfileSchema = z.object({
  name: nameValidation,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordValidation,
});
