import { z } from "zod";
import {
  COMMENT_MAX,
  MAX_RESPONSES_LIMIT,
  OPTION_ID_PATTERN,
  OPTION_LABEL_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_TYPES,
  SCALE_LABEL_MAX,
  SCALES,
  commentAllowed,
  isChoiceType,
  isScaleType,
  maxSelectionsOf,
  questionType,
  type MessageAnswer,
  type QuestionLike,
  type QuestionType,
} from "@/lib/answers";

// ---- Typed questions: config input ----

const optionInputSchema = z.object({
  // Echo an existing option's id to keep it (edits); omit for a new option.
  // Unknown ids are replaced server-side, never trusted.
  id: z.string().regex(OPTION_ID_PATTERN).optional(),
  label: z
    .string()
    .trim()
    .min(1, "Option can't be empty")
    .max(OPTION_LABEL_MAX, `Option cannot exceed ${OPTION_LABEL_MAX} characters`),
});

export const questionConfigInputSchema = z.object({
  options: z.array(optionInputSchema).max(OPTIONS_MAX, `At most ${OPTIONS_MAX} options`).optional(),
  allowComment: z.boolean().optional(),
  scaleLabels: z
    .object({
      min: z.string().trim().max(SCALE_LABEL_MAX).optional(),
      max: z.string().trim().max(SCALE_LABEL_MAX).optional(),
    })
    .optional(),
  maxSelections: z.number().int().min(1).max(OPTIONS_MAX).optional(),
});
export type QuestionConfigInput = z.infer<typeof questionConfigInputSchema>;

// ISO 8601 with an explicit offset/Z, so the server never guesses a
// timezone (a datetime-local value must be sent as toISOString()).
// null clears it on update.
const closesAtSchema = z
  .string()
  .datetime({ offset: true, message: "Invalid close date" })
  .nullable();
const maxResponsesSchema = z
  .number()
  .int("Response cap must be a whole number")
  .min(1, "Response cap must be at least 1")
  .max(MAX_RESPONSES_LIMIT, `Response cap cannot exceed ${MAX_RESPONSES_LIMIT}`)
  .nullable();

export interface ConfigIssue {
  path: (string | number)[];
  message: string;
}

/**
 * The per-type rules for a question's config — shared by the create
 * superRefine and the PUT route (which checks the merged, post-edit state).
 * Keys that don't apply to `type` are not errors; normalizeQuestionConfig
 * drops them.
 */
export function questionConfigIssues(
  type: QuestionType,
  config: QuestionConfigInput | null | undefined
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (!isChoiceType(type)) return issues;
  const options = config?.options ?? [];
  if (options.length < OPTIONS_MIN) {
    issues.push({ path: ["config", "options"], message: `Add at least ${OPTIONS_MIN} options` });
  }
  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();
  options.forEach((o, i) => {
    const key = o.label.trim().toLowerCase();
    if (seenLabels.has(key)) {
      issues.push({ path: ["config", "options", i, "label"], message: "Options must be unique" });
    }
    seenLabels.add(key);
    if (o.id) {
      if (seenIds.has(o.id)) {
        issues.push({ path: ["config", "options", i, "id"], message: "Duplicate option id" });
      }
      seenIds.add(o.id);
    }
  });
  if (
    type === "multi" &&
    config?.maxSelections !== undefined &&
    config.maxSelections > options.length
  ) {
    issues.push({
      path: ["config", "maxSelections"],
      message: "Max selections can't exceed the number of options",
    });
  }
  return issues;
}

/** Keeps only the config keys that apply to `type`; undefined for text. */
export function normalizeQuestionConfig(
  type: QuestionType,
  config: QuestionConfigInput | null | undefined
): QuestionConfigInput | undefined {
  if (type === "text") return undefined;
  const out: QuestionConfigInput = { allowComment: config?.allowComment ?? true };
  if (isScaleType(type)) {
    const min = config?.scaleLabels?.min?.trim();
    const max = config?.scaleLabels?.max?.trim();
    if (min || max) out.scaleLabels = { ...(min ? { min } : {}), ...(max ? { max } : {}) };
  }
  if (isChoiceType(type)) {
    out.options = (config?.options ?? []).map((o) => ({
      ...(o.id ? { id: o.id } : {}),
      label: o.label.trim(),
    }));
    if (type === "multi" && config?.maxSelections !== undefined) {
      out.maxSelections = config.maxSelections;
    }
  }
  return out;
}

export const createQuestionSchema = z
  .object({
    questionText: z
      .string()
      .min(10, "Question must be at least 10 characters long")
      .max(500, "Question cannot exceed 500 characters")
      .trim(),
    description: z
      .string()
      .max(1000, "Description cannot exceed 1000 characters")
      .optional(),
    // Optional team to scope the question to (within the active org).
    teamId: z.string().optional(),
    // "public" (default): anyone with the link can answer anonymously.
    // "internal": only logged-in org members can answer, each privately.
    visibility: z.enum(["public", "internal"]).optional(),
    // Typed questions (missing ⇒ text) and closing (missing ⇒ never closes).
    type: z.enum(QUESTION_TYPES).optional(),
    config: questionConfigInputSchema.optional(),
    closesAt: closesAtSchema.optional(),
    maxResponses: maxResponsesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    for (const issue of questionConfigIssues(data.type ?? "text", data.config)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, ...issue });
    }
    // Create only: a question born closed is a mistake. (An edit may set a
    // past date — that's "close now".)
    if (data.closesAt && new Date(data.closesAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: "Close date must be in the future",
      });
    }
  });

// Per-field shape only: the type/config rules depend on the question's
// current state, so the PUT route re-checks the merged result with
// questionConfigIssues.
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
  type: z.enum(QUESTION_TYPES).optional(),
  config: questionConfigInputSchema.optional(),
  closesAt: closesAtSchema.optional(),
  maxResponses: maxResponsesSchema.optional(),
});

export const questionResponseSchema = z.object({
  content: z
    .string()
    .min(1, "Response cannot be empty")
    .max(1000, "Response cannot exceed 1000 characters")
    .trim(),
});

// ---- Typed answers ----

/** What a submit route stores: turn-1 `content` (the comment for a typed
 * answer, possibly "") plus the structured `answer` for typed questions. */
export interface ParsedAnswer {
  content: string;
  answer?: MessageAnswer;
}

const commentSchema = z
  .string()
  .trim()
  .max(COMMENT_MAX, `Comment cannot exceed ${COMMENT_MAX} characters`);

/**
 * The submit-body schema for one question: `{content}` for text; for typed
 * questions `{score}` (rating/nps) or `{choices: optionId[]}` (single/multi)
 * plus an optional `content` comment. Choices must be the question's current
 * option ids; the output snapshots their labels. Always yields a ParsedAnswer.
 */
export function buildAnswerSchema(
  question: QuestionLike
): z.ZodType<ParsedAnswer, z.ZodTypeDef, unknown> {
  const type = questionType(question);
  if (type === "text") {
    return questionResponseSchema.transform((d) => ({ content: d.content }));
  }

  const allowComment = commentAllowed(question);
  const comment = commentSchema
    .optional()
    .refine((c) => allowComment || !c, "This question doesn't accept comments");

  if (isScaleType(type)) {
    const { min, max } = SCALES[type];
    return z
      .object({
        score: z
          .number({ required_error: "Pick a score", invalid_type_error: "Pick a score" })
          .int("Pick a score")
          .min(min, "Pick a score")
          .max(max, "Pick a score"),
        content: comment,
      })
      .transform((d) => ({
        content: d.content ?? "",
        answer: { kind: type, score: d.score },
      }));
  }

  const options = question.config?.options ?? [];
  const known = new Set(options.map((o) => o.id));
  const maxPick = type === "single" ? 1 : maxSelectionsOf(question);
  return z
    .object({
      choices: z
        .array(z.string(), {
          required_error: "Pick an option",
          invalid_type_error: "Pick an option",
        })
        .min(1, "Pick an option")
        .max(maxPick, maxPick === 1 ? "Pick one option" : `Pick at most ${maxPick} options`)
        .refine((ids) => new Set(ids).size === ids.length, "Duplicate choice")
        .refine((ids) => ids.every((id) => known.has(id)), "Unknown option"),
      content: comment,
    })
    .transform((d) => {
      // Stored in the question's option order, not click order, so the same
      // selection always reads the same.
      const picked = new Set(d.choices);
      const chosen = options.filter((o) => picked.has(o.id));
      return {
        content: d.content ?? "",
        answer: {
          kind: type,
          choices: chosen.map((o) => o.id),
          labels: chosen.map((o) => o.label),
        },
      };
    });
}

export type CreateQuestionRequest = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionRequest = z.infer<typeof updateQuestionSchema>;
export type QuestionResponseRequest = z.infer<typeof questionResponseSchema>;
