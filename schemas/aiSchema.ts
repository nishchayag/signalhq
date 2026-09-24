import { z } from "zod";

export const suggestMessagesSchema = z.object({
  teamId: z.string().optional(),
  hint: z.string().max(200, "Hint cannot exceed 200 characters").optional(),
});

export type SuggestMessagesRequest = z.infer<typeof suggestMessagesSchema>;

export const draftToneSchema = z.enum(["warm", "neutral", "brief"]);

export const draftReplySchema = z.object({
  tone: draftToneSchema,
  intent: z.string().max(300, "Intent cannot exceed 300 characters").optional(),
});

export type DraftReplyRequest = z.infer<typeof draftReplySchema>;
