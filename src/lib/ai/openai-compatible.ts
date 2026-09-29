/**
 * Shared OpenAI-compatible request plumbing for Groq and OpenRouter.
 * Both providers speak the same chat-completions wire format, so the
 * provider modules stay thin: configuration + error mapping only.
 *
 * Security notes:
 * - API keys are read from config (server env or BYOK), never logged.
 * - Error mapping never embeds request bodies or keys in messages.
 */
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { GenerateTextOptions, JsonSchemaDescriptor, ReasoningEffort } from "./types";

export const TIMEOUT_MS = 120_000;

/** Reasoning models burn completion tokens before emitting content. */
const REASONING_OVERHEAD: Record<ReasoningEffort, number> = {
  low: 256,
  medium: 1_500,
  high: 4_000,
};

function normalizeEffort(effort?: ReasoningEffort): ReasoningEffort {
  return effort === "medium" || effort === "high" ? effort : "low";
}

// Deliberately conservative (code tokenizes worse than prose); a slight
// overestimate of input tokens keeps prompt + completion inside the envelope.
const CHARS_PER_TOKEN = 3.2;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface ProviderConfig {
  /** Base URL, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string;
  /** Resolved model id for a request (manager decides text vs fast). */
  resolveModel(kind: "text" | "fast"): string;
  /** Per-request token envelope (prompt + completion), for budget planning. */
  maxTotalTokensPerRequest: number;
  apiKey: string;
  /** Log tag, e.g. "ai.groq". Never includes the key. */
  logTag: string;
  /** True for the app's own keys (enables fallback); false for BYOK. */
  providerOwned: boolean;
}

export interface CompletionRequestBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_completion_tokens: number;
  reasoning_effort: ReasoningEffort;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: JsonSchemaDescriptor & { strict: boolean } };
}

const MIN_COMPLETION_TOKENS = 1_000;
const SAFETY_MARGIN_TOKENS = 600;

/**
 * Computes the completion budget so that prompt + completion (plus a safety
 * margin) fit within the per-request envelope. The requested budget is never
 * exceeded, and the result is floored so generation stays meaningful.
 */
export function planCompletionBudget(
  config: ProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  requested: number | undefined,
  effort: ReasoningEffort,
  model: string,
  schema?: JsonSchemaDescriptor,
): number {
  // Structured-output schemas count toward prompt tokens on Groq.
  const schemaTokens = schema ? estimateTokens(JSON.stringify(schema.schema)) : 0;
  const inputTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0) + schemaTokens;
  const reasoningReserve = REASONING_OVERHEAD[effort];
  const headroom = config.maxTotalTokensPerRequest - inputTokens - SAFETY_MARGIN_TOKENS - reasoningReserve;

  // Fail fast before spending a request the envelope cannot hold.
  if (headroom < MIN_COMPLETION_TOKENS) {
    logger.error(
      config.logTag,
      `Context too large before request: inputTokensEstimate=${inputTokens} maxTotal=${config.maxTotalTokensPerRequest}`,
    );
    throw new AppError("AI_CONTEXT_TOO_LARGE", "Repository is too large for the current analysis budget. Try a smaller repository.");
  }

  const capped = Math.max(MIN_COMPLETION_TOKENS, Math.min(requested ?? config.maxTotalTokensPerRequest, headroom));

  logger.info(
    config.logTag,
    `budget model=${model} inputTokensEstimate=${inputTokens} maxCompletionTokens=${capped} totalRequestedTokens=${inputTokens + capped + SAFETY_MARGIN_TOKENS} effort=${effort}`,
  );
  return capped;
}

export function buildMessages(prompt: string, options: GenerateTextOptions): Array<{ role: "system" | "user"; content: string }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

export function buildBody(
  config: ProviderConfig,
  prompt: string,
  options: GenerateTextOptions,
  stream: boolean,
): CompletionRequestBody {
  const model = config.resolveModel(options.model ?? "text");
  const effort = normalizeEffort(options.reasoningEffort);
  const messages = buildMessages(prompt, options);
  const maxCompletionTokens = planCompletionBudget(config, messages, options.maxOutputTokens, effort, model, options.jsonSchema);

  const body: CompletionRequestBody = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_completion_tokens: maxCompletionTokens,
    reasoning_effort: effort,
    stream,
  };
  if (options.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { ...options.jsonSchema, strict: true },
    };
  } else if (options.json) {
    body.response_format = { type: "json_object" };
  }
  return body;
}

/**
 * Maps a provider HTTP failure to a normalized AppError.
 * `detail` (provider message text) is logged server-side but never surfaced.
 */
function mapHttpError(config: ProviderConfig, status: number, detail: string): AppError {
  const tag = config.logTag;
  switch (status) {
    case 429: {
      logger.warn(tag, `HTTP 429 rate limited${detail ? "" : ""}`);
      return new AppError("AI_RATE_LIMITED", "AI rate limit reached. Try again later or use your own API key.");
    }
    case 401:
    case 403:
      logger.error(tag, `HTTP ${status} — key rejected`);
      return new AppError("AI_AUTH_ERROR", "The configured AI provider key is invalid.");
    case 413:
      logger.error(tag, "HTTP 413 — request exceeded the model token limit");
      return new AppError("AI_CONTEXT_TOO_LARGE", "This repository is too large for the current analysis budget. Try a smaller repository or analyze a specific branch.");
    case 400: {
      // Structured output can 400 when completion space ran out before the
      // strict-schema document was fully emitted (missing required properties).
      if (/max completion tokens|truncated|missing required content/i.test(detail)) {
        logger.error(tag, `HTTP 400 — structured output truncated to completion budget`);
        return new AppError("AI_OUTPUT_TOO_LONG", "The AI response was too long for the output budget. Please try again.");
      }
      logger.error(tag, `HTTP 400 ${detail}`.trim());
      return new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
    }
    case 408:
    case 504:
      logger.error(tag, `HTTP ${status} — provider timeout`);
      return new AppError("AI_TIMEOUT", "The AI provider timed out. Please try again.");
    case 502:
    case 503:
      logger.error(tag, `HTTP ${status} — provider unavailable`);
      return new AppError("AI_PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please try again.");
    default:
      // Status + safe detail only; never request/response bodies (may contain repo content).
      logger.error(tag, `HTTP ${status} ${detail}`.trim());
      return new AppError("AI_PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please try again.");
  }
}

/** Performs one chat-completions request with normalized error mapping. */
export async function requestCompletion(config: ProviderConfig, body: CompletionRequestBody, signal: AbortSignal): Promise<Response> {
  // Never log the full prompt (contains repository content) or the key — size only.
  const promptChars = body.messages.reduce((acc, m) => acc + m.content.length, 0);
  logger.info(
    config.logTag,
    `POST /chat/completions model=${body.model} messages=${body.messages.length} promptChars=${promptChars} response_format=${body.response_format?.type ?? "none"} stream=${Boolean(body.stream)}`,
  );

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new AppError("AI_TIMEOUT", "The AI provider timed out. Please try again.");
    }
    throw new AppError("AI_PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please try again.");
  }

  if (res.ok) return res;
  let detail = "";
  try {
    const payload = (await res.clone().json()) as { error?: { message?: string } };
    detail = typeof payload.error?.message === "string" ? payload.error.message : "";
  } catch {
    // ignore body parse errors
  }
  throw mapHttpError(config, res.status, detail);
}

export interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Extracts message content with full guards; logs safe diagnostics
 * (finish reason, content presence/length) instead of raw bodies.
 */
export function extractContent(config: ProviderConfig, data: ChatCompletionResponse, model: string): string {
  const choice = data.choices?.[0];
  const finishReason = choice?.finish_reason ?? "unknown";
  const content = choice?.message?.content;

  if (typeof content !== "string" || content.length === 0) {
    logger.error(config.logTag, `Empty content: model=${model} finish_reason=${finishReason} hasChoices=${Array.isArray(data.choices)}`);
    throw new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
  }
  if (finishReason === "length") {
    logger.error(config.logTag, `Truncated output: model=${model} finish_reason=length contentChars=${content.length}`);
    throw new AppError("AI_OUTPUT_TOO_LONG", "The AI response was too long for the output budget. Please try again.");
  }
  logger.info(config.logTag, `OK model=${model} finish_reason=${finishReason} contentChars=${content.length}`);
  return content;
}

/** Parses a successful completion response body, guarding against non-JSON. */
export async function parseCompletionResponse(config: ProviderConfig, res: Response, model: string): Promise<string> {
  let data: ChatCompletionResponse;
  try {
    data = (await res.json()) as ChatCompletionResponse;
  } catch {
    logger.error(config.logTag, `Non-JSON response body: model=${model} status=${res.status}`);
    throw new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
  }
  return extractContent(config, data, model);
}

/** Reads an SSE chat-completions stream and yields content deltas. */
export async function* streamCompletion(config: ProviderConfig, res: Response, model: string): AsyncIterable<string> {
  if (!res.body) {
    logger.error(config.logTag, `Stream had no body: model=${model}`);
    throw new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          const chunk = JSON.parse(payload) as ChatCompletionChunk;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }
}

/** Wraps an async operation with a hard timeout. */
export function withTimeout<T>(op: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return op(controller.signal).finally(() => clearTimeout(timer));
}
