/**
 * Groq provider — OpenAI-compatible chat completions over fetch.
 * Requires GROQ_API_KEY (server-side only; never NEXT_PUBLIC_*).
 *
 * Free-tier aware: the completion budget is capped dynamically so that
 * system + user prompt + completion fits inside the per-request envelope.
 */
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, GenerateTextOptions, JsonSchemaDescriptor, ModelKind, ReasoningEffort } from "./types";

const BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TEXT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_FAST_MODEL = "openai/gpt-oss-20b";
const TIMEOUT_MS = 120_000;

/**
 * Free-tier per-request envelope. This org's limit is 8,000 tokens per
 * request (prompt + completion counted together), so we stay under it.
 * Raise this together with the Groq tier when upgrading.
 */
const MAX_TOTAL_TOKENS_PER_REQUEST = 7_800;
const SAFETY_MARGIN_TOKENS = 600;
const MIN_COMPLETION_TOKENS = 1_000;

/** Reasoning models burn completion tokens before emitting content. */
const REASONING_OVERHEAD: Record<ReasoningEffort, number> = {
  low: 256,
  medium: 1_500,
  high: 4_000,
};

function normalizeEffort(effort?: ReasoningEffort): ReasoningEffort {
  return effort === "medium" || effort === "high" ? effort : "low";
}

export function resolveModel(kind: ModelKind = "text"): string {
  if (kind === "fast") {
    return process.env.GROQ_FAST_MODEL?.trim() || DEFAULT_FAST_MODEL;
  }
  return process.env.GROQ_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new AppError("AI_ERROR", "AI service is not configured.");
  }
  return key.trim();
}

interface RequestBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_completion_tokens: number;
  reasoning_effort: ReasoningEffort;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: JsonSchemaDescriptor & { strict: boolean } };
}

function buildMessages(prompt: string, options: GenerateTextOptions): Array<{ role: "system" | "user"; content: string }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

// Deliberately conservative (code tokenizes worse than prose); a slight
// overestimate of input tokens keeps prompt + completion inside the envelope.
const CHARS_PER_TOKEN = 3.2;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Computes the completion budget so that prompt + completion (plus a safety
 * margin) fit within the per-request envelope. The requested budget is never
 * exceeded, and the result is floored so generation stays meaningful.
 */
function planCompletionBudget(
  messages: Array<{ role: "system" | "user"; content: string }>,
  requested: number | undefined,
  effort: ReasoningEffort,
  model: string,
  schema?: JsonSchemaDescriptor,
): number {
  // Groq counts the structured-output schema toward prompt tokens,
  // so it must be part of the input estimate.
  const schemaTokens = schema ? estimateTokens(JSON.stringify(schema.schema)) : 0;
  const inputTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0) + schemaTokens;
  const reasoningReserve = REASONING_OVERHEAD[effort];
  const headroom = MAX_TOTAL_TOKENS_PER_REQUEST - inputTokens - SAFETY_MARGIN_TOKENS - reasoningReserve;

  // Fail fast before spending a request the envelope cannot hold.
  if (headroom < MIN_COMPLETION_TOKENS) {
    logger.error(
      "ai.groq",
      `Context too large before request: inputTokensEstimate=${inputTokens} maxTotal=${MAX_TOTAL_TOKENS_PER_REQUEST}`,
    );
    throw new AppError("AI_CONTEXT_TOO_LARGE", "Repository is too large for the current analysis budget. Try a smaller repository.");
  }

  const capped = Math.max(MIN_COMPLETION_TOKENS, Math.min(requested ?? MAX_TOTAL_TOKENS_PER_REQUEST, headroom));

  logger.info(
    "ai.groq",
    `budget model=${model} inputTokensEstimate=${inputTokens} maxCompletionTokens=${capped} totalRequestedTokens=${inputTokens + capped + SAFETY_MARGIN_TOKENS} effort=${effort}`,
  );
  return capped;
}

function buildBody(
  prompt: string,
  options: GenerateTextOptions,
  stream: boolean,
): RequestBody {
  const model = resolveModel(options.model);
  const effort = normalizeEffort(options.reasoningEffort);
  const messages = buildMessages(prompt, options);
  const maxCompletionTokens = planCompletionBudget(messages, options.maxOutputTokens, effort, model, options.jsonSchema);

  const body: RequestBody = {
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

async function requestGroq(body: RequestBody, signal: AbortSignal): Promise<Response> {
  // Never log the full prompt (contains repository content) — size only.
  const promptChars = body.messages.reduce((acc, m) => acc + m.content.length, 0);
  logger.info(
    "ai.groq",
    `POST /chat/completions model=${body.model} messages=${body.messages.length} promptChars=${promptChars} response_format=${body.response_format?.type ?? "none"} stream=${Boolean(body.stream)}`,
  );

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new AppError("TIMEOUT", "The AI request timed out. Please try again.");
    }
    throw new AppError("AI_ERROR", "Could not reach the AI service. Please try again.");
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const detail = retryAfter ? ` Try again in ${retryAfter}s.` : " Please try again shortly.";
    logger.warn("ai.groq", `HTTP 429 rate limited${retryAfter ? ` (retry-after ${retryAfter}s)` : ""}`);
    throw new AppError("AI_RATE_LIMITED", `AI rate limit reached. Please try again shortly.${detail}`);
  }
  if (res.status === 401 || res.status === 403) {
    logger.error("ai.groq", `HTTP ${res.status} — key rejected`);
    throw new AppError("AI_ERROR", "AI service is not configured.");
  }
  if (res.status === 413) {
    logger.error("ai.groq", "HTTP 413 — request exceeded the model token limit");
    throw new AppError("AI_CONTEXT_TOO_LARGE", "Repository is too large for the current analysis budget. Try a smaller repository.");
  }
  if (res.status === 400) {
    // Structured output can 400 when completion space ran out before the
    // strict-schema document was fully emitted (missing required properties).
    let detail = "";
    try {
      const payload = (await res.clone().json()) as { error?: { message?: string } };
      detail = payload.error?.message ?? "";
    } catch {
      // ignore body parse errors
    }
    if (/max completion tokens|truncated|missing required content/i.test(detail)) {
      logger.error("ai.groq", `HTTP 400 — structured output truncated to completion budget: ${detail}`);
      throw new AppError("AI_OUTPUT_TOO_LONG", "AI analysis exceeded the output budget. Try again.");
    }
    logger.error("ai.groq", `HTTP 400 ${detail}`.trim());
    throw new AppError("AI_ERROR", "The AI service rejected the request. Please try again.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.clone().json()) as { error?: { message?: string } };
      detail = payload.error?.message ?? "";
    } catch {
      // ignore body parse errors
    }
    // Status + safe detail only; never request/response bodies (may contain repo content).
    logger.error("ai.groq", `HTTP ${res.status} ${detail}`.trim());
    throw new AppError("AI_ERROR", "The AI service returned an error. Please try again.");
  }
  return res;
}

/**
 * Extracts message content with full guards; logs safe diagnostics
 * (finish reason, content presence/length) instead of raw bodies.
 */
function extractContent(data: ChatCompletionResponse, model: string): string {
  const choice = data.choices?.[0];
  const finishReason = choice?.finish_reason ?? "unknown";
  const content = choice?.message?.content;

  if (typeof content !== "string" || content.length === 0) {
    logger.error("ai.groq", `Empty content: model=${model} finish_reason=${finishReason} hasChoices=${Array.isArray(data.choices)}`);
    throw new AppError("AI_ERROR", "The AI returned an empty response.");
  }
  if (finishReason === "length") {
    logger.error("ai.groq", `Truncated output: model=${model} finish_reason=length contentChars=${content.length}`);
    throw new AppError("AI_OUTPUT_TOO_LONG", "AI analysis exceeded the output budget. Try again.");
  }
  logger.info("ai.groq", `OK model=${model} finish_reason=${finishReason} contentChars=${content.length}`);
  return content;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export class GroqProvider implements AIProvider {
  readonly name = "groq";

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const body = buildBody(prompt, options, false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await requestGroq(body, controller.signal);
      let data: ChatCompletionResponse;
      try {
        data = (await res.json()) as ChatCompletionResponse;
      } catch {
        logger.error("ai.groq", `Non-JSON response body: model=${body.model} status=${res.status}`);
        throw new AppError("AI_ERROR", "The AI service returned an unreadable response. Please try again.");
      }
      return extractContent(data, body.model);
    } finally {
      clearTimeout(timer);
    }
  }

  async generateStructured<T>(prompt: string, schemaName: string, options: GenerateTextOptions = {}): Promise<T> {
    const raw = await this.generateText(prompt, { ...options, json: true, jsonSchema: options.jsonSchema ?? { name: schemaName, schema: {} } });
    return parseJsonLoose<T>(raw);
  }

  async *streamText(prompt: string, options: GenerateTextOptions = {}): AsyncIterable<string> {
    const body = buildBody(prompt, options, true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await requestGroq(body, controller.signal);
      if (!res.body) {
        logger.error("ai.groq", `Stream had no body: model=${body.model}`);
        throw new AppError("AI_ERROR", "The AI returned an empty response.");
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
    } finally {
      clearTimeout(timer);
    }
  }
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

export function getAIProvider(): AIProvider {
  apiKey(); // fail fast with a clear message when unconfigured
  logger.info("ai", `Using provider: groq (${resolveModel("text")})`);
  return new GroqProvider();
}
