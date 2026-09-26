import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { MockEmbeddingModelV1, MockLanguageModelV1 } from "ai/test";
import { z } from "zod";
import {
  AiUnavailableError,
  MODELS,
  __setTestProvider,
  aiEmbed,
  aiModerate,
  aiObject,
  aiText,
  isAiEnabled,
  logAiError,
} from "@/lib/ai";

const SECRET = "only night-shift nurse on Ward 4 since March";

function textModel(text: string) {
  // "json" mirrors the real Mistral chat model's defaultObjectGenerationMode.
  return new MockLanguageModelV1({
    defaultObjectGenerationMode: "json",
    doGenerate: async () => {
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
        text,
      };
    },
  });
}

function install(lm: MockLanguageModelV1, modelIds: string[] = []) {
  __setTestProvider({
    languageModel: (id) => {
      modelIds.push(id);
      return lm;
    },
    textEmbeddingModel: () =>
      new MockEmbeddingModelV1<string>({
        doEmbed: async ({ values }) => ({ embeddings: values.map((v) => [v.length, 1, 0]) }),
      }),
  });
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
});

afterEach(() => {
  __setTestProvider(null);
  delete process.env.MISTRAL_API_KEY;
  delete process.env.AI_DISABLED;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isAiEnabled", () => {
  it("needs a key and no AI_DISABLED=1", () => {
    expect(isAiEnabled()).toBe(true);
    process.env.AI_DISABLED = "1";
    expect(isAiEnabled()).toBe(false);
    process.env.AI_DISABLED = "0";
    expect(isAiEnabled()).toBe(true);
    delete process.env.MISTRAL_API_KEY;
    expect(isAiEnabled()).toBe(false);
  });

  it("every helper throws AiUnavailableError when disabled", async () => {
    delete process.env.MISTRAL_API_KEY;
    const schema = z.object({ a: z.string() });
    await expect(aiText({ feature: "suggest", tier: "fast", prompt: "p" })).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(aiObject({ feature: "suggest", tier: "fast", prompt: "p", schema })).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(aiEmbed(["x"])).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(aiModerate(["x"])).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("real provider guard", () => {
  it("refuses to build the real provider under Vitest", async () => {
    await expect(aiText({ feature: "suggest", tier: "fast", prompt: "p" })).rejects.toThrow(/Vitest/);
    await expect(aiModerate(["x"])).rejects.toThrow(/Vitest/);
  });
});

describe("aiText / aiObject / aiEmbed", () => {
  it("aiText returns the model text and uses the tier's model", async () => {
    const ids: string[] = [];
    install(textModel("hello"), ids);
    await expect(aiText({ feature: "suggest", tier: "smart", system: "s", prompt: "p" })).resolves.toBe("hello");
    expect(ids).toEqual([MODELS.smart]);
  });

  it("aiObject parses and validates structured output", async () => {
    const ids: string[] = [];
    install(textModel(JSON.stringify({ tags: ["a", "b"] })), ids);
    const schema = z.object({ tags: z.array(z.string()).max(3) });
    await expect(aiObject({ feature: "enrich", tier: "fast", prompt: "p", schema })).resolves.toEqual({ tags: ["a", "b"] });
    expect(ids).toEqual([MODELS.fast]);
  });

  it("aiObject rejects output that fails the schema", async () => {
    install(textModel(JSON.stringify({ tags: ["a", "b", "c", "d"] })));
    const schema = z.object({ tags: z.array(z.string()).max(3) });
    await expect(aiObject({ feature: "enrich", tier: "fast", prompt: "p", schema })).rejects.toThrow();
  });

  it("aiEmbed returns Float32Arrays in input order, and [] for no input", async () => {
    install(textModel(""));
    const out = await aiEmbed(["ab", "abcd"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(out[0])).toEqual([2, 1, 0]);
    expect(Array.from(out[1])).toEqual([4, 1, 0]);
    await expect(aiEmbed([])).resolves.toEqual([]);
  });
});

describe("aiModerate", () => {
  beforeEach(() => install(textModel("")));

  it("posts to Mistral and derives toxicity/pii per input", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          model: MODELS.moderation,
          results: [
            {
              categories: { sexual: false, violence_and_threats: true, pii: false, some_new_key: true },
              category_scores: { sexual: 0.1, violence_and_threats: 0.9, health: 0.95, pii: 0.2, some_new_key: 0.99 },
            },
            { categories: {}, category_scores: {} },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await aiModerate(["one", "two"]);
    expect(a.toxicity).toBe(0.9); // health and unknown keys don't count as abuse
    expect(a.pii).toBe(0.2);
    expect(a.scores.some_new_key).toBe(0.99);
    expect(b).toEqual({ categories: {}, scores: {}, toxicity: 0, pii: 0 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/moderations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string)).toEqual({ model: MODELS.moderation, input: ["one", "two"] });
  });

  it("throws on HTTP errors, malformed bodies, and result-count mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    await expect(aiModerate(["x"])).rejects.toMatchObject({ statusCode: 429 });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: "bad" }), { status: 200 })));
    await expect(aiModerate(["x"])).rejects.toThrow();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));
    await expect(aiModerate(["x"])).rejects.toThrow();
  });
});

describe("logAiError", () => {
  it("logs only the name and status, never prompts or response bodies", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new APICallError({
      message: `Bad request: ${SECRET}`,
      url: "https://api.mistral.ai/v1/chat/completions",
      requestBodyValues: { messages: [{ role: "user", content: SECRET }] },
      statusCode: 400,
      responseBody: `{"error":"${SECRET}"}`,
    });

    logAiError("guard", err);

    expect(spy).toHaveBeenCalledTimes(1);
    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).toBe("[ai:guard] AI_APICallError (status 400)");
    expect(printed).not.toContain("Ward 4");
  });

  it("does not leak a failed model call's prompt", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    install(
      new MockLanguageModelV1({
        doGenerate: async () => {
          throw new APICallError({
            message: SECRET,
            url: "u",
            requestBodyValues: { prompt: SECRET },
            statusCode: 500,
            isRetryable: false,
          });
        },
      })
    );
    const caught = await aiText({ feature: "draft", tier: "fast", prompt: SECRET }).catch((e) => e);
    logAiError("draft", caught);
    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).not.toContain("Ward 4");
    expect(printed).toMatch(/^\[ai:draft\] /);
  });

  it("handles non-Error throwables", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiError("suggest", SECRET);
    logAiError("suggest", { status: 503, body: SECRET });
    const printed = spy.mock.calls.flat().map(String).join(" ");
    expect(printed).not.toContain("Ward 4");
    expect(spy.mock.calls[1][0]).toBe("[ai:suggest] object (status 503)");
  });
});
