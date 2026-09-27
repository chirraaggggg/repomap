/**
 * AI provider contracts. Implementations live in their own modules
 * (e.g. groq.ts) and are exposed through getAIProvider().
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
  /** Requested completion budget; the provider caps it to the free-tier envelope. */
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

export interface AIProvider {
  readonly name: string;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
  generateStructured<T>(prompt: string, schemaName: string, options?: GenerateTextOptions): Promise<T>;
  streamText(prompt: string, options?: GenerateTextOptions): AsyncIterable<string>;
}
