/**
 * Groq provider — OpenAI-compatible chat completions.
 * Requires GROQ_API_KEY (server-side only; never NEXT_PUBLIC_*), or a BYOK
 * key passed per-request through the manager.
 *
 * Free-tier aware: the completion budget is capped dynamically so that
 * system + user prompt + completion fits inside the per-request envelope.
 */
import { AppError } from "@/lib/errors";
import {
  buildBody,
  parseCompletionResponse,
  requestCompletion,
  streamCompletion,
  withTimeout,
  type ProviderConfig,
} from "../openai-compatible";
import type { AIProvider, GenerateTextOptions } from "../types";

const DEFAULT_TEXT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_FAST_MODEL = "openai/gpt-oss-20b";

/**
 * Free-tier per-request envelope. This org's limit is 8,000 tokens per
 * request (prompt + completion counted together), so we stay under it.
 * Raise this together with the Groq tier when upgrading.
 */
const MAX_TOTAL_TOKENS_PER_REQUEST = 7_800;

export function resolveGroqModel(kind: "text" | "fast"): string {
  if (kind === "fast") {
    return process.env.GROQ_FAST_MODEL?.trim() || DEFAULT_FAST_MODEL;
  }
  return process.env.GROQ_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/** Builds the provider bound to a specific (never-logged) API key. */
export function createGroqProvider(apiKey: string, providerOwned: boolean): AIProvider {
  const config: ProviderConfig = {
    baseUrl: "https://api.groq.com/openai/v1",
    resolveModel: resolveGroqModel,
    maxTotalTokensPerRequest: MAX_TOTAL_TOKENS_PER_REQUEST,
    apiKey,
    logTag: "ai.groq",
    providerOwned,
  };

  return {
    name: "groq",

    async verifyKey(): Promise<boolean> {
      try {
        const res = await fetch(`${config.baseUrl}/models`, {
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
      return parseJsonLoose<T>(raw);
    },

    async *streamText(prompt, options = {}): AsyncIterable<string> {
      const body = buildBody(config, prompt, options, true);
      const res = await withTimeout((signal) => requestCompletion(config, body, signal));
      yield* streamCompletion(config, res, body.model);
    },
  };
}

export function requireGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new AppError("AI_ERROR", "AI service is not configured.");
  }
  return key.trim();
}

/** Tolerant JSON parser: strips markdown fences, finds the outermost object. */
export function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? (fenced[1] ?? "").trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new AppError("AI_ERROR", "The AI response was malformed. Please try again.");
  }
}
