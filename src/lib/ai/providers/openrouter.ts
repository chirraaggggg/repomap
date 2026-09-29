/**
 * OpenRouter provider — OpenAI-compatible chat completions.
 * Uses OPENROUTER_API_KEY (server-side only) or a BYOK key per request.
 *
 * The model is configurable via OPENROUTER_TEXT_MODEL / OPENROUTER_FAST_MODEL;
 * `openrouter/free` routes to a free model but is NOT guaranteed unlimited —
 * rate limits and availability apply, so failures surface as normal AI errors.
 */
import {
  buildBody,
  parseCompletionResponse,
  requestCompletion,
  streamCompletion,
  withTimeout,
  type ProviderConfig,
} from "../openai-compatible";
import type { AIProvider, GenerateTextOptions } from "../types"

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TEXT_MODEL = "openrouter/free";
const DEFAULT_FAST_MODEL = "openrouter/free";

export function resolveOpenRouterModel(kind: "text" | "fast"): string {
  if (kind === "fast") {
    return process.env.OPENROUTER_FAST_MODEL?.trim() || DEFAULT_FAST_MODEL;
  }
  return process.env.OPENROUTER_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function openRouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/** Builds the provider bound to a specific (never-logged) API key. */
export function createOpenRouterProvider(apiKey: string, providerOwned: boolean): AIProvider {
  const config: ProviderConfig = {
    baseUrl: openRouterBaseUrl(),
    resolveModel: resolveOpenRouterModel,
    // OpenRouter routes to arbitrary models; assume a generous but bounded
    // envelope. The budget planner still caps completion per request.
    maxTotalTokensPerRequest: 24_000,
    apiKey,
    logTag: "ai.openrouter",
    providerOwned,
  };

  return {
    name: "openrouter",

    async verifyKey(): Promise<boolean> {
      try {
        const res = await fetch(`${config.baseUrl}/key`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: "no-store",
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    async generateText(prompt, options = {}): Promise<string> {
      const body = buildBody(config, prompt, options, false);
      return withTimeout((signal) =>
        requestCompletion(config, body, signal).then((res) => parseCompletionResponse(config, res, body.model)),
      );
    },

    async generateStructured<T>(prompt: string, schemaName: string, options: GenerateTextOptions = {}): Promise<T> {
      const raw = await this.generateText(prompt, {
        ...options,
        json: true,
        jsonSchema: options.jsonSchema ?? { name: schemaName, schema: {} },
      });
      // parseJsonLoose is a pure helper shared with the Groq provider.
      const { parseJsonLoose } = await import("./groq");
      return parseJsonLoose<T>(raw);
    },

    async *streamText(prompt, options = {}): AsyncIterable<string> {
      const body = buildBody(config, prompt, options, true);
      const res = await withTimeout((signal) => requestCompletion(config, body, signal));
      yield* streamCompletion(config, res, body.model);
    },
  };
}
