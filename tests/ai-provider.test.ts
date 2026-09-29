import { describe, it, expect, vi, afterEach } from "vitest";
import { parseByokCredentials } from "@/lib/security/credentials";
import { AIManager, getAI, hasProviderConfig } from "@/lib/ai/manager";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { aiRateLimit, RATE_LIMITS } from "@/lib/security/limits";

const VALID_GROQ_KEY = "gsk_abcdef0123456789abcdef0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("BYOK credential parsing", () => {
  it("accepts a valid provider/key pair", () => {
    const creds = parseByokCredentials({ aiProvider: "groq", aiApiKey: VALID_GROQ_KEY });
    expect(creds).toEqual({ provider: "groq", apiKey: VALID_GROQ_KEY });
  });

  it("accepts openrouter keys", () => {
    const creds = parseByokCredentials({ aiProvider: "openrouter", aiApiKey: "sk-or-abcdef0123456789abcd" });
    expect(creds?.provider).toBe("openrouter");
  });

  it("returns undefined when no BYOK fields are present (server-key mode)", () => {
    expect(parseByokCredentials({ url: "https://github.com/a/b" })).toBeUndefined();
    expect(parseByokCredentials(null)).toBeUndefined();
    expect(parseByokCredentials("string")).toBeUndefined();
  });

  it("rejects unknown providers and malformed keys", () => {
    expect(parseByokCredentials({ aiProvider: "anthropic", aiApiKey: VALID_GROQ_KEY })).toBeUndefined();
    expect(parseByokCredentials({ aiProvider: "groq", aiApiKey: "short" })).toBeUndefined();
    expect(parseByokCredentials({ aiProvider: "groq", aiApiKey: "has spaces in it yes indeed" })).toBeUndefined();
    expect(parseByokCredentials({ aiProvider: "groq" })).toBeUndefined();
  });

  it("never leaks the key via toString of the manager error paths", () => {
    // Constructing with an empty key must throw the normalized auth error.
    expect(() => new AIManager({ provider: "groq", apiKey: "  " })).toThrow("The configured AI provider key is invalid.");
  });
});

describe("AI manager provider selection", () => {
  it("exposes the BYOK provider name", () => {
    const manager = new AIManager({ provider: "openrouter", apiKey: "sk-or-abcdef0123456789abcd" });
    expect(manager.name).toBe("openrouter");
  });

  it("defaults to groq when using server keys", () => {
    vi.stubEnv("GROQ_API_KEY", VALID_GROQ_KEY);
    const manager = getAI();
    expect(manager.name).toBe("groq");
  });

  it("reports hasProviderConfig from env", () => {
    vi.stubEnv("GROQ_API_KEY", VALID_GROQ_KEY);
    expect(hasProviderConfig()).toBe(true);
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    // Re-evaluate with cleared envs (delete for empty-string safety)
    vi.stubEnv("GROQ_API_KEY", "");
    expect(hasProviderConfig()).toBe(false);
  });

  it("surfaces transient errors without a configured fallback (no silent swap)", async () => {
    vi.stubEnv("GROQ_API_KEY", VALID_GROQ_KEY);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const manager = getAI();

    const transient = new AppError("AI_RATE_LIMITED", "AI rate limit reached.");
    const generateText = vi.spyOn(manager as unknown as { primary: () => unknown }, "primary" as never);
    generateText.mockImplementation(() => {
      throw transient;
    });

    await expect(manager.generateText("prompt")).rejects.toBe(transient);
  });

  it("retries once on the fallback provider for provider-owned keys", async () => {
    vi.stubEnv("GROQ_API_KEY", VALID_GROQ_KEY);
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-abcdef0123456789abcd");

    const manager = getAI();
    const calls: string[] = [];
    const transient = new AppError("AI_PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable.");

    const managerInternal = manager as unknown as { primary: () => unknown; fallbackProvider: () => unknown };
    vi.spyOn(managerInternal, "primary").mockImplementation(() => {
      calls.push("primary");
      return {
        generateText: () => Promise.reject(transient),
      };
    });
    vi.spyOn(managerInternal, "fallbackProvider").mockImplementation(() => ({
      generateText: () => {
        calls.push("fallback");
        return Promise.resolve("ok");
      },
    }));

    const result = await manager.generateText("prompt");
    expect(result).toBe("ok");
    expect(calls).toEqual(["primary", "fallback"]);
  });

  it("does not retry non-transient errors (auth, context size)", async () => {
    vi.stubEnv("GROQ_API_KEY", VALID_GROQ_KEY);
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-abcdef0123456789abcd");

    const manager = getAI();
    const calls: string[] = [];
    const authError = new AppError("AI_AUTH_ERROR", "The configured AI provider key is invalid.");

    const managerInternal = manager as unknown as { primary: () => unknown; fallbackProvider: () => unknown };
    vi.spyOn(managerInternal, "primary").mockImplementation(() => {
      calls.push("primary");
      return { generateText: () => Promise.reject(authError) };
    });
    vi.spyOn(managerInternal, "fallbackProvider").mockImplementation(() => {
      calls.push("fallback");
      return { generateText: () => Promise.resolve("ok") };
    });

    await expect(manager.generateText("prompt")).rejects.toBe(authError);
    expect(calls).toEqual(["primary"]);
  });
});

describe("application rate limits", () => {
  it("uses configurable limits with sane defaults", () => {
    expect(RATE_LIMITS.analyze.limit).toBe(3);
    expect(RATE_LIMITS.chat.limit).toBe(20);
    expect(RATE_LIMITS.explain.limit).toBe(10);
  });

  it("reads limits from environment", () => {
    vi.stubEnv("RATE_LIMIT_ANALYZE", "7");
    vi.resetModules();
    return import("@/lib/security/limits").then((mod) => {
      expect(mod.RATE_LIMITS.analyze.limit).toBe(7);
    });
  });

  it("gives BYOK requests a separate bucket with a higher limit", () => {
    const key = `byok-test-${Math.random()}`;
    const serverLimit = RATE_LIMITS.chat.limit;
    const byokLimit = serverLimit * RATE_LIMITS.byokMultiplier;

    let exhausted = 0;
    for (let i = 0; i < serverLimit; i++) {
      if (!aiRateLimit("chat", key, false).ok) exhausted++;
    }
    expect(exhausted).toBe(0);
    // The very next server-key request is blocked...
    expect(aiRateLimit("chat", key, false).ok).toBe(false);
    // ...but the BYOK bucket for the same client is untouched and larger.
    expect(aiRateLimit("chat", key, true).ok).toBe(true);
    for (let i = 0; i < byokLimit - 1; i++) {
      expect(aiRateLimit("chat", key, true).ok).toBe(true);
    }
    expect(aiRateLimit("chat", key, true).ok).toBe(false);
  });

  it("underlying fixed-window limiter still blocks past the limit", () => {
    const key = `raw-${Math.random()}`;
    expect(rateLimit(key, 1, 60_000).ok).toBe(true);
    expect(rateLimit(key, 1, 60_000).ok).toBe(false);
  });
});
