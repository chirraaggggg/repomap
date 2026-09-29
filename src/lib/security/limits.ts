/**
 * Server-side application rate limits, configurable via environment:
 *   RATE_LIMIT_ANALYZE (default 3/hour), RATE_LIMIT_CHAT (default 20/hour),
 *   RATE_LIMIT_EXPLAIN (default 10/hour).
 *
 * BYOK requests are throttled separately (slightly looser but still bounded)
 * so the service cannot be abused through user keys either.
 */
import { rateLimit, type RateLimitResult } from "./rate-limit";

function envLimit(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export const RATE_LIMITS = {
  analyze: { limit: envLimit("RATE_LIMIT_ANALYZE", 3), windowMs: 60 * 60_000 },
  chat: { limit: envLimit("RATE_LIMIT_CHAT", 20), windowMs: 60 * 60_000 },
  explain: { limit: envLimit("RATE_LIMIT_EXPLAIN", 10), windowMs: 60 * 60_000 },
  refresh: { limit: envLimit("RATE_LIMIT_REFRESH", 3), windowMs: 60 * 60_000 },
  /** BYOK variants: user brings compute, but the app still bounds usage. */
  byokMultiplier: 3,
} as const;

/** Rate limit for an AI endpoint; BYOK requests get a separate, looser bucket. */
export function aiRateLimit(
  scope: "analyze" | "chat" | "explain" | "refresh",
  clientKey: string,
  byok: boolean,
): RateLimitResult {
  const config = RATE_LIMITS[scope];
  const limit = byok ? config.limit * RATE_LIMITS.byokMultiplier : config.limit;
  // Separate buckets so BYOK traffic cannot exhaust the server-key budget.
  return rateLimit(`${clientKey}${byok ? ":byok" : ""}`, limit, config.windowMs);
}
