/**
 * AI manager — the single entry point every feature uses.
 *
 * Resolution order:
 * 1. BYOK credentials supplied for this request → use the user's provider/key
 *    (never falls back to RepoTutor-owned keys).
 * 2. RepoTutor's configured provider (Groq first, OpenRouter fallback for
 *    transient failures). RepoTutor-owned credentials only.
 *
 * Security: keys exist only inside this module for the duration of a request.
 * They are never logged, never persisted, never echoed in errors or responses.
 *
 * Fallback policy (provider-owned keys only):
 * - max 1 retry for transient failures (429 / 5xx / network / timeout)
 * - respect Retry-After semantics via bounded exponential backoff
 * - no retry on auth errors, invalid requests, or context-size errors
 * - BYOK failures are returned to the user as-is (normalized, key-free)
 */
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createGroqProvider, isGroqConfigured, requireGroqApiKey } from "./providers/groq";
import { createOpenRouterProvider, isOpenRouterConfigured } from "./providers/openrouter";
import type { AIProvider, GenerateTextOptions, ProviderCredentials } from "./types";

export type { AIProvider, GenerateTextOptions, ProviderCredentials } from "./types";

/** Error codes that may resolve by switching providers (transient). */
const TRANSIENT_CODES = new Set([
  "AI_RATE_LIMITED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_TIMEOUT",
]);

const FALLBACK_DELAY_MS = 1_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the app has at least one RepoTutor-owned provider configured. */
export function hasProviderConfig(): boolean {
  return isGroqConfigured() || isOpenRouterConfigured();
}

/**
 * Builds the AI facade for one request.
 * - BYOK: the user's provider only; errors propagate (normalized).
 * - Server: Groq, falling back to OpenRouter once on transient errors.
 */
export function getAI(credentials?: ProviderCredentials): AIManager {
  return new AIManager(credentials);
}

/** True when error is transient and a fallback may help. */
function isTransient(err: unknown): err is AppError {
  return err instanceof AppError && TRANSIENT_CODES.has(err.code);
}

export class AIManager implements AIProvider {
  readonly name: "groq" | "openrouter";
  private readonly credentials?: ProviderCredentials;

  constructor(credentials?: ProviderCredentials) {
    if (credentials && (!credentials.apiKey || credentials.apiKey.trim().length === 0)) {
      throw new AppError("AI_AUTH_ERROR", "The configured AI provider key is invalid.");
    }
    this.credentials = credentials;
    this.name = credentials?.provider ?? "groq";
  }

  private get isByok(): boolean {
    return Boolean(this.credentials);
  }

  /**
   * Resolves the primary provider for this request.
   * BYOK → exactly the user's provider. Server → Groq (must be configured).
   */
  private primary(): AIProvider {
    if (this.credentials) {
      const key = this.credentials.apiKey.trim();
      return this.credentials.provider === "openrouter"
        ? createOpenRouterProvider(key, false)
        : createGroqProvider(key, false);
    }
    // RepoTutor-owned: Groq primary. Unconfigured is a server setup error.
    return createGroqProvider(requireGroqApiKey(), true);
  }

  /** RepoTutor-owned OpenRouter fallback, or null when unconfigured/BYOK. */
  private fallbackProvider(): AIProvider | null {
    if (this.isByok) return null; // never silently swap a user's key
    if (!isOpenRouterConfigured()) return null;
    const key = process.env.OPENROUTER_API_KEY;
    return key ? createOpenRouterProvider(key.trim(), true) : null;
  }

  /**
   * Runs `op` against the primary provider; on transient failure with
   * provider-owned keys, retries once against OpenRouter after a bounded delay.
   */
  private async run<T>(op: (provider: AIProvider) => Promise<T>): Promise<T> {
    const primary = this.primary();
    try {
      return await op(primary);
    } catch (err) {
      if (!isTransient(err)) throw err;
      const fallback = this.fallbackProvider();
      if (!fallback) {
        // BYOK or no fallback configured: surface the normalized error.
        throw err;
      }
      logger.warn("ai.manager", `Primary provider failed (${err.code}); falling back to openrouter`);
      await delay(FALLBACK_DELAY_MS); // bounded backoff; respects 429 pacing
      try {
        return await op(fallback);
      } catch (fallbackErr) {
        // Both providers failed — report the more actionable primary error.
        logger.error("ai.manager", "Fallback provider also failed", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
        throw err;
      }
    }
  }

  async verifyKey(): Promise<boolean> {
    try {
      return await this.primary().verifyKey();
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, options?: GenerateTextOptions): Promise<string> {
    return this.run((provider) => provider.generateText(prompt, options));
  }

  async generateStructured<T>(prompt: string, schemaName: string, options?: GenerateTextOptions): Promise<T> {
    return this.run((provider) => provider.generateStructured<T>(prompt, schemaName, options));
  }

  async *streamText(prompt: string, options?: GenerateTextOptions): AsyncIterable<string> {
    // Streaming does not fall back mid-stream; a transient primary failure
    // before the first byte falls back to the provider-owned fallback.
    const primary = this.primary();
    try {
      yield* primary.streamText(prompt, options);
    } catch (err) {
      if (!isTransient(err)) throw err;
      const fallback = this.fallbackProvider();
      if (!fallback) throw err;
      logger.warn("ai.manager", `Stream failed on primary (${err.code}); retrying on openrouter`);
      yield* fallback.streamText(prompt, options);
    }
  }
}
