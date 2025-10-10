import { z } from "zod";

export const createQuestionSchema = z.object({
  questionText: z
    .string()
    .min(10, "Question must be at least 10 characters long")
    .max(500, "Question cannot exceed 500 characters")
    .trim(),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),
});

export const updateQuestionSchema = z.object({
  questionText: z
    .string()
    .min(10, "Question must be at least 10 characters long")
    .max(500, "Question cannot exceed 500 characters")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),
  isActive: z.boolean().optional(),
});

export const questionResponseSchema = z.object({
  content: z
    .string()
    .min(1, "Response cannot be empty")
    .max(1000, "Response cannot exceed 1000 characters")
    .trim(),
});

export type CreateQuestionRequest = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionRequest = z.infer<typeof updateQuestionSchema>;
export type QuestionResponseRequest = z.infer<typeof questionResponseSchema>;
