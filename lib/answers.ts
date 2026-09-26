// Typed questions (rating, NPS, single/multi choice) and closing (close
// date, response cap). Mongoose-free and server-free, so the models, the zod
// schemas, route handlers and client components all share one definition.
import { nanoid } from "nanoid";

export const QUESTION_TYPES = ["text", "rating", "nps", "single", "multi"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
/** The typed kinds: everything except free text. `Message.answer.kind`. */
export const ANSWER_KINDS = ["rating", "nps", "single", "multi"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

/** Fixed scales: rating is 1–5, NPS is the standard 0–10. */
export const SCALES = {
  rating: { min: 1, max: 5 },
  nps: { min: 0, max: 10 },
} as const;

export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 10;
export const OPTION_LABEL_MAX = 80;
export const SCALE_LABEL_MAX = 40;
export const COMMENT_MAX = 1000;
export const MAX_RESPONSES_LIMIT = 100_000;
/** Option ids are server-generated nanoids; this bounds what a client may echo back. */
export const OPTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,21}$/;

export interface QuestionOption {
  id: string;
  label: string;
}

export interface ScaleLabels {
  min?: string;
  max?: string;
}

/** `Question.config`. Every field reads correctly when missing. */
export interface QuestionConfig {
  /** single / multi only. */
  options?: QuestionOption[];
  /** Typed questions only: whether an optional comment is offered. Missing ⇒ true. */
  allowComment?: boolean;
  /** rating / nps only: captions for the two ends of the scale. */
  scaleLabels?: ScaleLabels;
  /** multi only. Missing ⇒ any number of options (up to all). */
  maxSelections?: number;
}

/** `Message.answer`. `labels` snapshots the chosen options' labels at submit
 * time, so renaming an option later doesn't rewrite past answers. */
export interface MessageAnswer {
  kind: AnswerKind;
  score?: number;
  choices?: string[];
  labels?: string[];
}

/** The question fields these helpers read (hydrated doc or lean object). */
export interface QuestionLike {
  type?: QuestionType | null;
  config?: QuestionConfig | null;
  closesAt?: Date | string | null;
  maxResponses?: number | null;
  responseCount?: number | null;
}

/** Missing type ⇒ text (every question from before typed questions). */
export function questionType(q: Pick<QuestionLike, "type">): QuestionType {
  return q.type && (QUESTION_TYPES as readonly string[]).includes(q.type) ? q.type : "text";
}

export function isChoiceType(t: QuestionType): t is "single" | "multi" {
  return t === "single" || t === "multi";
}

export function isScaleType(t: QuestionType): t is "rating" | "nps" {
  return t === "rating" || t === "nps";
}

export function commentAllowed(q: QuestionLike): boolean {
  return questionType(q) === "text" || q.config?.allowComment !== false;
}

/** How many options a multi-choice answer may pick. */
export function maxSelectionsOf(q: QuestionLike): number {
  const n = q.config?.options?.length ?? 0;
  const m = q.config?.maxSelections;
  return typeof m === "number" && m >= 1 ? Math.min(m, n) : n;
}

/**
 * One line of text for an answer — dashboard chips, the CSV "Answer"
 * column, digest/draft context. "" for no answer (a text question).
 *   rating → "4/5", nps → "9/10", single → "Blue", multi → "Blue, Green".
 */
export function formatAnswer(answer: MessageAnswer | null | undefined): string {
  if (!answer) return "";
  switch (answer.kind) {
    case "rating":
    case "nps":
      return typeof answer.score === "number" ? `${answer.score}/${SCALES[answer.kind].max}` : "";
    case "single":
    case "multi":
      return (answer.labels ?? []).join(", ");
    default:
      return "";
  }
}

export type ClosedReason = "date" | "cap";
export type QuestionState = { closed: false } | { closed: true; reason: ClosedReason };

/**
 * Whether a question still takes new responses. Computed, never stored.
 * `isActive` is a separate switch (an inactive question is simply not
 * found publicly); this covers the close date and the response cap. The
 * submit routes enforce the same two rules atomically when they claim a slot,
 * so this is the read-side view, not the guard.
 */
export function questionState(q: QuestionLike, now: Date = new Date()): QuestionState {
  if (q.closesAt && new Date(q.closesAt).getTime() <= now.getTime()) {
    return { closed: true, reason: "date" };
  }
  if (typeof q.maxResponses === "number" && (q.responseCount ?? 0) >= q.maxResponses) {
    return { closed: true, reason: "cap" };
  }
  return { closed: false };
}

/** What the public response form needs to render a question — never counts
 * or the cap (the cap would leak the response count). */
export interface PublicQuestionConfig {
  type: QuestionType;
  allowComment: boolean;
  scale?: { min: number; max: number };
  scaleLabels?: ScaleLabels;
  options?: QuestionOption[];
  maxSelections?: number;
}

export function publicQuestionConfig(q: QuestionLike): PublicQuestionConfig {
  const type = questionType(q);
  const out: PublicQuestionConfig = { type, allowComment: commentAllowed(q) };
  if (isScaleType(type)) {
    out.scale = { ...SCALES[type] };
    const sl = q.config?.scaleLabels;
    if (sl && (sl.min || sl.max)) {
      out.scaleLabels = {
        ...(sl.min ? { min: sl.min } : {}),
        ...(sl.max ? { max: sl.max } : {}),
      };
    }
  }
  if (isChoiceType(type)) {
    out.options = (q.config?.options ?? []).map((o) => ({ id: o.id, label: o.label }));
    if (type === "multi") out.maxSelections = maxSelectionsOf(q);
  }
  return out;
}

/**
 * Final option ids for a saved config: an option keeps its id only if that
 * id already belongs to this question (`existingIds`); anything else — new
 * options, or ids a client made up — gets a fresh server-generated one.
 */
export function assignOptionIds(
  options: { id?: string; label: string }[],
  existingIds: Iterable<string> = []
): QuestionOption[] {
  const keep = new Set(existingIds);
  const used = new Set<string>();
  return options.map((o) => {
    let id = o.id && keep.has(o.id) && !used.has(o.id) ? o.id : nanoid(8);
    while (used.has(id)) id = nanoid(8);
    used.add(id);
    return { id, label: o.label };
  });
}

/** Whether two option lists have the same id set (order-insensitive). A
 * question with answers may relabel or reorder options, never add/remove. */
export function sameOptionIds(
  a: { id: string }[] | null | undefined,
  b: { id: string }[] | null | undefined
): boolean {
  const x = new Set((a ?? []).map((o) => o.id));
  const y = new Set((b ?? []).map((o) => o.id));
  return x.size === y.size && [...x].every((id) => y.has(id));
}
