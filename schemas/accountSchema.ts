import z from "zod";
import { nameValidation } from "./signUpSchema";

export const updateProfileSchema = z.object({
  name: nameValidation,
});
