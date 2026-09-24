import { z } from "zod";

export const suggestMessagesSchema = z.object({
  teamId: z.string().optional(),
  hint: z.string().max(200, "Hint cannot exceed 200 characters").optional(),
});

export type SuggestMessagesRequest = z.infer<typeof suggestMessagesSchema>;
