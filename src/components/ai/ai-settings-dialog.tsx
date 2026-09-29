"use client";

/**
 * AI settings dialog — unobtrusive provider/BYOK configuration.
 * The key is held only in React state (see ai-settings-context) and sent
 * per-request to RepoTutor API routes. Nothing is stored.
 */
import { useState } from "react";
import { Check, ChevronDown, Loader2, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useAISettings, type ProviderId } from "./ai-settings-context";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{ id: ProviderId; label: string; hint: string }> = [
  { id: "repotutor", label: "RepoTutor AI", hint: "Uses RepoTutor's hosted AI. No key needed." },
  { id: "groq", label: "Groq — BYOK", hint: "Use your own Groq key (console.groq.com/keys)." },
  { id: "openrouter", label: "OpenRouter — BYOK", hint: "Use your own OpenRouter key (openrouter.ai/keys)." },
];

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok" } | { status: "invalid" } | { status: "error"; message: string };

/** Single-request key verification through the RepoTutor server. */
async function testKey(provider: "groq" | "openrouter", apiKey: string): Promise<TestState> {
  try {
    const res = await fetch("/api/ai/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiProvider: provider, aiApiKey: apiKey }),
    });
    if (res.ok) return { status: "ok" };
    if (res.status === 401) return { status: "invalid" };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { status: "error", message: body?.error?.message ?? "Could not verify the key. Try again." };
  } catch {
    return { status: "error", message: "Could not reach the server. Check your connection." };
  }
}

export function AISettingsDialog() {
  const { settings, setProvider, setApiKey, clearApiKey, isByok } = useAISettings();
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const selected = PROVIDERS.find((p) => p.id === settings.provider) ?? PROVIDERS[0]!;
  const byokProvider = settings.provider === "groq" || settings.provider === "openrouter";
  const activeKey = settings.apiKey ?? "";

  const openDialog = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftKey(activeKey);
      setTest(activeKey ? { status: "ok" } : { status: "idle" });
    }
    setOpen(nextOpen);
  };

  const handleSave = () => {
    setApiKey(draftKey.trim());
    setTest(draftKey.trim() ? { status: "ok" } : { status: "idle" });
    setOpen(false);
  };

  const handleTest = async () => {
    if (!byokProvider || !draftKey.trim()) return;
    setTest({ status: "testing" });
    setTest(await testKey(settings.provider as "groq" | "openrouter", draftKey.trim()));
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text)]"
          aria-label="AI settings"
          title="AI settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{selected.label.split(" — ")[0]}</span>
          {isByok ? <Check className="h-3 w-3 text-[var(--success)]" aria-hidden /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent title="AI settings" className="max-w-md">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">AI Provider</p>
            <div className="relative">
              <select
                value={settings.provider}
                onChange={(e) => {
                  setProvider(e.target.value as ProviderId);
                  setDraftKey("");
                  setTest({ status: "idle" });
                }}
                aria-label="AI provider"
                className="h-10 w-full appearance-none rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{selected.hint}</p>
          </div>

          {byokProvider ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="byok-key" className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  API Key
                </label>
                <Input
                  id="byok-key"
                  type="password"
                  value={draftKey}
                  onChange={(e) => {
                    setDraftKey(e.target.value);
                    setTest({ status: "idle" });
                  }}
                  placeholder="••••••••••••"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="byok-privacy"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={test.status === "testing" || !draftKey.trim()}>
                  {test.status === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Test Key
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSave} disabled={!draftKey.trim()}>
                  Save
                </Button>
                {activeKey || draftKey ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--danger)] hover:text-[var(--danger)]"
                    onClick={() => {
                      clearApiKey();
                      setDraftKey("");
                      setTest({ status: "idle" });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear key
                  </Button>
                ) : null}
                {test.status === "ok" ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                    <Check className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : null}
                {test.status === "invalid" ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--danger)]">
                    <X className="h-3.5 w-3.5" /> Invalid API key
                  </span>
                ) : null}
                {test.status === "error" ? <span className={cn("text-xs text-[var(--danger)]")}>{test.message}</span> : null}
              </div>

              <p id="byok-privacy" className="text-xs leading-relaxed text-[var(--text-muted)]">
                Your key is used only for this browser session and is not stored by RepoTutor.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
