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

// Where a guarded draft is headed. A union of single-key objects so later
// targets (e.g. `{ replyToken }` for follow-ups) slot in as one more member;
// `.strict()` makes a body naming two targets invalid rather than ambiguous.
export const guardTargetSchema = z.union([
  z.object({ orgSlug: z.string().min(1).max(100) }).strict(),
  z.object({ questionSlug: z.string().min(1).max(100) }).strict(),
]);

export const guardRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(1000, "Content cannot exceed 1000 characters"),
  target: guardTargetSchema,
});

export type GuardTarget = z.infer<typeof guardTargetSchema>;
export type GuardRequest = z.infer<typeof guardRequestSchema>;

export const GUARD_RISKS = ["low", "medium", "high"] as const;
export type GuardRisk = (typeof GUARD_RISKS)[number];

export const GUARD_CATEGORIES = [
  "name",
  "role",
  "team",
  "date",
  "location",
  "contact",
  "event",
  "distinctive_phrase",
  "other",
] as const;
export type GuardCategory = (typeof GUARD_CATEGORIES)[number];

/** What the model must return for POST /api/guard (validated, then post-processed). */
export const guardOutputSchema = z.object({
  risk: z.enum(GUARD_RISKS),
  issues: z
    .array(
      z.object({
        snippet: z.string().max(120),
        category: z.enum(GUARD_CATEGORIES),
        why: z.string().max(160),
      })
    )
    .max(8),
  rewrite: z.string().max(1000),
});

export type GuardIssue = z.infer<typeof guardOutputSchema>["issues"][number];

/** Body of a 200 from POST /api/guard. */
export interface GuardResponse {
  risk: GuardRisk;
  issues: GuardIssue[];
  /** Suggested rewrite; null when the model had nothing to change or only moderation ran. */
  rewrite: string | null;
  /** Present (true) when only the moderation classifier answered — no issues/rewrite. */
  partial?: true;
}
