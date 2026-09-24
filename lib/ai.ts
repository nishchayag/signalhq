import { embedMany, generateObject, generateText } from "ai";
import type { EmbeddingModel, LanguageModel } from "ai";
import { createMistral } from "@ai-sdk/mistral";
import { z } from "zod";
import type { AiFeature } from "@/models/aiUsage.model";

// The ONLY module that talks to the AI provider, and the single mock seam
// for tests (see test-utils/aiMock.ts). Routes never import the provider or
// the `ai` SDK directly.

export const AI_PROVIDER = "mistral";

export const MODELS = {
  fast: "mistral-small-latest",
  smart: "mistral-medium-latest",
  embed: "mistral-embed",
  moderation: "mistral-moderation-2603",
} as const;

export type AiTier = "fast" | "smart";

const DEFAULT_TIMEOUT_MS = 20_000;
const MODERATION_TIMEOUT_MS = 8_000;
const MODERATION_URL = "https://api.mistral.ai/v1/moderations";

/** Thrown by every helper when AI is switched off (no key, or AI_DISABLED=1). */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI is not configured on this server.");
    this.name = "AiUnavailableError";
  }
}

export function isAiEnabled(): boolean {
  return !!process.env.MISTRAL_API_KEY && process.env.AI_DISABLED !== "1";
}

// Minimal provider surface we use; the Mistral provider satisfies it.
interface AiProviderLike {
  languageModel(modelId: string): LanguageModel;
  textEmbeddingModel(modelId: string): EmbeddingModel<string>;
}

let provider: AiProviderLike | null = null;
let testProvider: AiProviderLike | null = null;

/**
 * Test-only injection point (lib/ai.test.ts) for `ai/test` mock models.
 * Pass null to clear.
 */
export function __setTestProvider(p: AiProviderLike | null): void {
  testProvider = p;
}

// Lazy so importing this module never needs a key. Refuses to build a real
// provider under Vitest: vercel.json runs the suite with the production key
// present, so an unmocked test must fail loudly rather than call Mistral.
function getProvider(): AiProviderLike {
  if (testProvider) return testProvider;
  if (process.env.VITEST) {
    throw new Error(
      'Real AI provider used under Vitest — mock "@/lib/ai" (test-utils/aiMock.ts).'
    );
  }
  if (!provider) {
    provider = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return provider;
}

function assertEnabled(): void {
  if (!isAiEnabled()) throw new AiUnavailableError();
}

interface BaseCall {
  // Tags the call for telemetry correlation; callers log failures themselves
  // via logAiError(feature, err).
  feature: AiFeature;
  tier: AiTier;
  system?: string;
  prompt: string;
  timeoutMs?: number;
}

/** Structured output validated against `schema` (throws on mismatch). */
export async function aiObject<T>(
  opts: BaseCall & { schema: z.ZodType<T> }
): Promise<T> {
  assertEnabled();
  const { object } = await generateObject({
    model: getProvider().languageModel(MODELS[opts.tier]),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    experimental_telemetry: { isEnabled: false, functionId: opts.feature },
  });
  return object as T;
}

export async function aiText(opts: BaseCall): Promise<string> {
  assertEnabled();
  const { text } = await generateText({
    model: getProvider().languageModel(MODELS[opts.tier]),
    system: opts.system,
    prompt: opts.prompt,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    experimental_telemetry: { isEnabled: false, functionId: opts.feature },
  });
  return text;
}

/** One embedding per input, in order. The SDK chunks large batches. */
export async function aiEmbed(
  texts: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Float32Array[]> {
  assertEnabled();
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: getProvider().textEmbeddingModel(MODELS.embed),
    values: texts,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  return embeddings.map((e) => Float32Array.from(e));
}

// Categories that count as abuse towards the recipient. Anything else the
// classifier returns (health, financial, law, pii, or keys added in newer
// model versions) is kept in `scores` but doesn't raise `toxicity`.
const ABUSE_CATEGORIES = [
  "sexual",
  "hate_and_discrimination",
  "violence_and_threats",
  "dangerous_and_criminal_content",
  "selfharm",
];

const moderationResponseSchema = z.object({
  results: z.array(
    z.object({
      categories: z.record(z.boolean()),
      category_scores: z.record(z.number()),
    })
  ),
});

export interface ModerationResult {
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  /** Max score over the abuse categories, 0..1. */
  toxicity: number;
  /** PII score, 0..1. */
  pii: number;
}

class AiModerationError extends Error {
  constructor(readonly statusCode?: number) {
    super("Moderation request failed");
    this.name = "AiModerationError";
  }
}

/**
 * Mistral's moderation endpoint isn't wrapped by @ai-sdk/mistral, so this is
 * a raw fetch. Returns one result per input, in order.
 */
export async function aiModerate(texts: string[]): Promise<ModerationResult[]> {
  assertEnabled();
  if (texts.length === 0) return [];
  // Same Vitest guard as getProvider(): tests must inject a provider (and
  // stub fetch) or mock "@/lib/ai" entirely.
  getProvider();
  const res = await fetch(MODERATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({ model: MODELS.moderation, input: texts }),
    signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
  });
  if (!res.ok) throw new AiModerationError(res.status);

  const parsed = moderationResponseSchema.safeParse(await res.json());
  if (!parsed.success || parsed.data.results.length !== texts.length) {
    throw new AiModerationError(res.status);
  }
  return parsed.data.results.map((r) => {
    const scores = r.category_scores;
    const toxicity = Math.max(0, ...ABUSE_CATEGORIES.map((c) => scores[c] ?? 0));
    return { categories: r.categories, scores, toxicity, pii: scores.pii ?? 0 };
  });
}

/**
 * Log an AI failure without leaking content. AI SDK errors (APICallError)
 * carry the full prompt in `requestBodyValues` and the provider's response
 * body, so only the error name and HTTP status are ever printed.
 */
export function logAiError(feature: string, err: unknown): void {
  const rawName =
    typeof err === "object" && err !== null && typeof (err as { name?: unknown }).name === "string"
      ? (err as { name: string }).name
      : typeof err;
  const name = rawName.slice(0, 60);
  let status: number | undefined;
  if (typeof err === "object" && err !== null) {
    const e = err as { statusCode?: unknown; status?: unknown };
    if (typeof e.statusCode === "number") status = e.statusCode;
    else if (typeof e.status === "number") status = e.status;
  }
  console.error(`[ai:${feature}] ${name}${status !== undefined ? ` (status ${status})` : ""}`);
}
