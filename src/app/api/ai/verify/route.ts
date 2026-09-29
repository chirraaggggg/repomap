import { NextRequest } from "next/server";
import { getAI } from "@/lib/ai/manager";
import { getClientKey } from "@/lib/security/rate-limit";
import { aiRateLimit } from "@/lib/security/limits";
import { parseByokCredentials } from "@/lib/security/credentials";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * BYOK key verification. The key is validated (shape) and forwarded once to
 * the provider's cheap "list models"/"check key" endpoint. It is never
 * logged, stored, or echoed — the response is a boolean only.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "BAD_REQUEST", message: "Invalid request body." } }, { status: 400 });
  }

  const credentials = parseByokCredentials(body);
  if (!credentials) {
    return Response.json({ error: { code: "AI_AUTH_ERROR", message: "Invalid API key." } }, { status: 401 });
  }

  const rl = aiRateLimit("explain", getClientKey(request, "verify"), true);
  if (!rl.ok) {
    return Response.json({ error: { code: "RATE_LIMIT", message: "Too many verification attempts. Please wait." } }, { status: 429 });
  }

  try {
    const model = getAI(credentials);
    const ok = await model.verifyKey();
    if (!ok) {
      return Response.json({ error: { code: "AI_AUTH_ERROR", message: "Invalid API key." } }, { status: 401 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    // Network/unexpected failures: log safely (no key material), report generically.
    logger.warn("ai.verify", "Key verification failed", err instanceof Error ? err.message : err);
    return Response.json({ error: { code: "AI_PROVIDER_UNAVAILABLE", message: "Could not verify the key right now. Try again." } }, { status: 503 });
  }
}
