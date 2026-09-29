/**
 * Canonical AI provider contract. Implementations live in providers/
 * (groq.ts, openrouter.ts) and are composed by manager.ts.
 *
 * Features (analyze / chat / explain) call `ai.<operation>(...)` — never a
 * concrete provider directly — so the manager can resolve BYOK vs.
 * RepoTutor-owned keys, pick models, and apply fallback uniformly.
 */

/** Which model tier to use for a request. */
export type ModelKind = "text" | "fast";

/** Reasoning effort for reasoning models (GPT-OSS). Lower = fewer reasoning tokens. */
export type ReasoningEffort = "low" | "medium" | "high";

/** JSON Schema for strict structured output (OpenAI/Groq json_schema format). */
export interface JsonSchemaDescriptor {
  name: string;
  schema: Record<string, unknown>;
}

export interface GenerateTextOptions {
  /** Optional system instruction. */
  system?: string;
  temperature?: number;
  /** Requested completion budget; the provider caps it to its own envelope. */
  maxOutputTokens?: number;
  /** Ask the provider for JSON output; callers still validate loosely. */
  json?: boolean;
  /** Strict structured output: the model must emit JSON matching this schema. */
  jsonSchema?: JsonSchemaDescriptor;
  /** Reasoning effort; "low" keeps structured output tokens for actual content. */
  reasoningEffort?: ReasoningEffort;
  /** "text" for complex analysis, "fast" for lightweight operations. */
  model?: ModelKind;
}

/**
 * BYOK credentials supplied by the browser for a single request.
 * Kept in memory on the client, used in-memory on the server, never persisted,
 * never logged, never echoed back in responses or errors.
 */
export interface ProviderCredentials {
  provider: "groq" | "openrouter";
  apiKey: string;
}

export interface AIProvider {
  readonly name: "groq" | "openrouter";
  /** Tests a key cheaply; used by the BYOK "Test key" action. */
  verifyKey(): Promise<boolean>;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
  generateStructured<T>(prompt: string, schemaName: string, options?: GenerateTextOptions): Promise<T>;
  streamText(prompt: string, options?: GenerateTextOptions): AsyncIterable<string>;
}
