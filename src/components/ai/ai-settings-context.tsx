"use client";

/**
 * BYOK settings — session-scoped AI provider configuration.
 *
 * Security contract:
 * - The API key lives ONLY in React state (in-memory) in this tab.
 * - Never written to localStorage/sessionStorage, cookies, or URLs.
 * - Cleared on page refresh automatically (memory is ephemeral).
 * - Sent per-request in the HTTPS body to RepoTutor API routes only.
 * - RepoTutor never persists, logs, or echoes the key.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ProviderId = "repotutor" | "groq" | "openrouter";

export interface AISettings {
  /** Which provider to use. "repotutor" = server-owned keys. */
  provider: ProviderId;
  /** BYOK key, in-memory only. Empty/undefined for "repotutor". */
  apiKey?: string;
}

interface AISettingsContextValue {
  settings: AISettings;
  setProvider: (provider: ProviderId) => void;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  /** True when a BYOK provider with a key is selected. */
  isByok: boolean;
}

const AISettingsContext = createContext<AISettingsContextValue | null>(null);

export function AISettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AISettings>({ provider: "repotutor" });

  const setProvider = useCallback((provider: ProviderId) => {
    setSettings((prev) => {
      // Switching away from BYOK (or to it) drops any stale key immediately.
      if (provider === "repotutor") return { provider };
      return { provider, apiKey: prev.provider === provider ? prev.apiKey : undefined };
    });
  }, []);

  const setApiKey = useCallback((key: string) => {
    setSettings((prev) => ({ ...prev, apiKey: key }));
  }, []);

  const clearApiKey = useCallback(() => {
    setSettings((prev) => ({ ...prev, apiKey: undefined }));
  }, []);

  const value = useMemo<AISettingsContextValue>(
    () => ({
      settings,
      setProvider,
      setApiKey,
      clearApiKey,
      isByok: settings.provider !== "repotutor" && Boolean(settings.apiKey),
    }),
    [settings, setProvider, setApiKey, clearApiKey],
  );

  return <AISettingsContext.Provider value={value}>{children}</AISettingsContext.Provider>;
}

export function useAISettings(): AISettingsContextValue {
  const ctx = useContext(AISettingsContext);
  if (!ctx) throw new Error("useAISettings must be used within AISettingsProvider");
  return ctx;
}
