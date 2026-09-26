import { isChoiceType, isScaleType, type ClosedReason, type PublicQuestionConfig } from "@/lib/answers";

/**
 * Local form state for a public/typed answer, before it's shaped into the
 * submit routes' per-type body. `content` is always a string: the free-text
 * answer for a text question, or the optional comment otherwise.
 */
export interface AnswerFormValues {
  content: string;
  score?: number;
  choices?: string[];
}

export function emptyAnswerValues(): AnswerFormValues {
  return { content: "" };
}

/**
 * Whether the current values are complete enough to submit, per type. A
 * pure mirror of the server's per-type zod schema
 * (schemas/questionSchema.ts#buildAnswerSchema) used only to enable/disable
 * the submit button — the server re-validates regardless.
 */
export function canSubmitAnswer(config: PublicQuestionConfig, values: AnswerFormValues): boolean {
  if (config.type === "text") return values.content.trim().length > 0;
  if (isScaleType(config.type)) return typeof values.score === "number";
  if (isChoiceType(config.type)) {
    const n = values.choices?.length ?? 0;
    return config.type === "single" ? n === 1 : n >= 1;
  }
  return false;
}

/** The exact POST body the submit/answer routes expect for this type. */
export function buildAnswerBody(
  config: PublicQuestionConfig,
  values: AnswerFormValues
): Record<string, unknown> {
  const content = values.content.trim();
  if (config.type === "text") return { content };
  if (isScaleType(config.type)) return { score: values.score, content };
  return { choices: values.choices ?? [], content };
}

/**
 * Add/remove `id` from a multi-choice selection, honoring `max`. A no-op
 * when already at the cap and adding a new one — never throws, so a click
 * on a disabled-looking option is harmless either way.
 */
export function toggleChoice(current: string[] | undefined, id: string, max: number): string[] {
  const list = current ?? [];
  if (list.includes(id)) return list.filter((c) => c !== id);
  if (list.length >= max) return list;
  return [...list, id];
}

/** One line explaining why a question stopped accepting responses — the
 * public form's closed card, and anywhere else `questionState` is closed. */
export function closedMessage(reason?: ClosedReason): string {
  if (reason === "cap") return "This question has reached its response limit.";
  if (reason === "date") return "This question closed on its scheduled date.";
  return "This question is no longer accepting responses.";
}
