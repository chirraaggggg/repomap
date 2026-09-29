/**
 * Parses optional BYOK credentials from a request body.
 *
 * Security contract:
 * - Keys travel only in the HTTPS request body (never URLs, never headers that
 *   get logged by proxies).
 * - Validated for shape and length; rejected values never reach the provider.
 * - Never logged, never persisted, never returned in any response.
 */
import type { ProviderCredentials } from "@/lib/ai/types";

const MAX_KEY_LENGTH = 200;

const KEY_PATTERNS: Record<"groq" | "openrouter", RegExp> = {
  // Groq keys: gsk_...; OpenRouter keys: sk-or-... — but accept generic
  // bearer-style keys too since providers can change formats.
  groq: /^[A-Za-z0-9_\-]{20,200}$/,
  openrouter: /^[A-Za-z0-9_\-]{20,200}$/,
};

/**
 * Extracts `{ aiProvider, aiApiKey }` from an already-parsed body object.
 * Returns undefined when absent (server-key mode). Throws nothing — invalid
 * credentials simply disable BYOK for the request.
 */
export function parseByokCredentials(body: unknown): ProviderCredentials | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const obj = body as Record<string, unknown>;
  const provider = obj.aiProvider;
  const apiKey = obj.aiApiKey;

  if (provider !== "groq" && provider !== "openrouter") return undefined;
  if (typeof apiKey !== "string") return undefined;
  const trimmed = apiKey.trim();
  if (trimmed.length < 20 || trimmed.length > MAX_KEY_LENGTH) return undefined;
  if (!KEY_PATTERNS[provider].test(trimmed)) return undefined;

  return { provider, apiKey: trimmed };
}

/** Strips BYOK fields from a body before further processing/logging. */
export function stripCredentials<T extends Record<string, unknown>>(body: T): Omit<T, "aiProvider" | "aiApiKey"> {
  const { aiProvider: _p, aiApiKey: _k, ...rest } = body;
  void _p;
  void _k;
  return rest;
}
