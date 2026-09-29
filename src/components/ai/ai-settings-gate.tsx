"use client";

/**
 * Client gate that mounts the AI settings provider and bridges the
 * session-only BYOK state into the API client. Renders the settings control
 * so it can be dropped anywhere in the tree.
 */
import { useEffect } from "react";
import { setByokFieldsSupplier } from "@/lib/byok";
import { AISettingsProvider } from "./ai-settings-context";
import { AISettingsDialog } from "./ai-settings-dialog";
import { useAISettings } from "./ai-settings-context";

function ByokBridge() {
  const { settings, isByok } = useAISettings();

  useEffect(() => {
    // Keep a *getter*; the key itself stays in React state.
    setByokFieldsSupplier(() =>
      isByok && (settings.provider === "groq" || settings.provider === "openrouter") && settings.apiKey
        ? { aiProvider: settings.provider, aiApiKey: settings.apiKey }
        : {},
    );
  }, [settings, isByok]);

  return null;
}

export function AISettingsGate({ children }: { children: React.ReactNode }) {
  return (
    <AISettingsProvider>
      <ByokBridge />
      {children}
    </AISettingsProvider>
  );
}

export { AISettingsDialog };
