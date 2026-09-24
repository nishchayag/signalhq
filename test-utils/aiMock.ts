import { vi } from "vitest";
import type * as AiModule from "@/lib/ai";

/**
 * Reusable mock for "@/lib/ai". Usage in a test file:
 *
 *   vi.mock("@/lib/ai", async () => (await import("@/test-utils/aiMock")).aiMockModule());
 *   import { aiMock } from "@/test-utils/aiMock";
 *   beforeEach(() => aiMock.reset());
 *
 * The factory and the test share this module instance, so `aiMock` controls
 * what the mocked helpers do. Defaults are deterministic: AI enabled, a
 * fixed text, an object you set with `setObject`, hash-based embeddings, and
 * zero moderation scores. `MODELS`, `AI_FEATURES`, `AiUnavailableError` and
 * `logAiError` are the real implementations.
 */

type Ai = typeof AiModule;
type HelperName = "aiObject" | "aiText" | "aiEmbed" | "aiModerate";

export const EMBED_DIM = 8;

/** Deterministic, L2-normalised vector derived from the text. */
export function fakeEmbedding(text: string): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < text.length; i++) {
    v[i % EMBED_DIM] += text.charCodeAt(i);
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

function zeroModeration(): AiModule.ModerationResult {
  return { categories: {}, scores: {}, toxicity: 0, pii: 0 };
}

interface State {
  enabled: boolean;
  text: string;
  object: unknown;
  embed: (texts: string[]) => Float32Array[];
  moderate: (texts: string[]) => AiModule.ModerationResult[];
  failures: Partial<Record<HelperName, Error>>;
  hanging: Set<HelperName>;
}

function initialState(): State {
  return {
    enabled: true,
    text: "Mock AI text",
    object: undefined,
    embed: (texts) => texts.map(fakeEmbedding),
    moderate: (texts) => texts.map(zeroModeration),
    failures: {},
    hanging: new Set(),
  };
}

let state = initialState();
let UnavailableCtor: (new () => Error) | null = null;

// Shared preamble for every mocked helper: disabled → AiUnavailableError,
// hang → never settles, fail → throws the configured error.
async function gate(name: HelperName): Promise<void> {
  if (!state.enabled) throw new (UnavailableCtor ?? Error)();
  if (state.hanging.has(name)) await new Promise(() => {});
  const err = state.failures[name];
  if (err) throw err;
}

const fns = {
  isAiEnabled: vi.fn(() => state.enabled),
  aiObject: vi.fn(async (opts: { schema: { parse: (v: unknown) => unknown } }) => {
    await gate("aiObject");
    if (state.object === undefined) {
      throw new Error("aiMock: call aiMock.setObject(value) before using aiObject");
    }
    return opts.schema.parse(state.object);
  }),
  aiText: vi.fn(async (opts: unknown) => {
    void opts;
    await gate("aiText");
    return state.text;
  }),
  aiEmbed: vi.fn(async (texts: string[]) => {
    await gate("aiEmbed");
    return state.embed(texts);
  }),
  aiModerate: vi.fn(async (texts: string[]) => {
    await gate("aiModerate");
    return state.moderate(texts);
  }),
};

export const aiMock = {
  fns,
  /** Restore defaults and clear call history. Call in beforeEach. */
  reset() {
    state = initialState();
    Object.values(fns).forEach((f) => f.mockClear());
  },
  enable() {
    state.enabled = true;
  },
  /** isAiEnabled() → false and every helper throws AiUnavailableError. */
  disable() {
    state.enabled = false;
  },
  setText(text: string) {
    state.text = text;
  },
  /** Value aiObject returns (still validated by the caller's schema). */
  setObject(value: unknown) {
    state.object = value;
  },
  setEmbed(fn: (texts: string[]) => Float32Array[]) {
    state.embed = fn;
  },
  setModerate(fn: (texts: string[]) => AiModule.ModerationResult[]) {
    state.moderate = fn;
  },
  /** Make one helper (or all) reject until reset. Defaults to an APICallError-like error. */
  fail(name: HelperName | "all", err?: Error) {
    const e = err ?? Object.assign(new Error("mock AI failure"), { name: "AI_APICallError", statusCode: 500 });
    const names: HelperName[] = name === "all" ? ["aiObject", "aiText", "aiEmbed", "aiModerate"] : [name];
    for (const n of names) state.failures[n] = e;
  },
  /** Make one helper (or all) never settle — for timeout/"AI hangs" tests. */
  hang(name: HelperName | "all") {
    const names: HelperName[] = name === "all" ? ["aiObject", "aiText", "aiEmbed", "aiModerate"] : [name];
    for (const n of names) state.hanging.add(n);
  },
};

/** Module factory for `vi.mock("@/lib/ai", ...)`. */
export async function aiMockModule(): Promise<Partial<Ai>> {
  const actual = await vi.importActual<Ai>("@/lib/ai");
  UnavailableCtor = actual.AiUnavailableError;
  return {
    AI_PROVIDER: actual.AI_PROVIDER,
    AI_FEATURES: actual.AI_FEATURES,
    MODELS: actual.MODELS,
    AiUnavailableError: actual.AiUnavailableError,
    logAiError: actual.logAiError,
    isAiEnabled: fns.isAiEnabled,
    aiObject: fns.aiObject as unknown as Ai["aiObject"],
    aiText: fns.aiText as unknown as Ai["aiText"],
    aiEmbed: fns.aiEmbed as unknown as Ai["aiEmbed"],
    aiModerate: fns.aiModerate as unknown as Ai["aiModerate"],
  };
}
