"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import type { ImportantFile, TreeEntry } from "@/types";
import { buildClientMasterPrompt, type PromptMode } from "@/lib/master-prompt-client";

interface Props {
  owner: string;
  repo: string;
  branch: string;
  masterPrompt: string;
  treeEntries: TreeEntry[];
  analysisFiles: ImportantFile[];
}

const MODES: Array<{ id: PromptMode; label: string; description: string }> = [
  { id: "quick", label: "Quick", description: "Compact context for fast chats" },
  { id: "detailed", label: "Detailed", description: "Full analysis with key source files" },
  { id: "developer", label: "Developer", description: "Onboarding-oriented with setup and risks" },
];

export function PromptTab({ owner, repo, branch, masterPrompt, treeEntries, analysisFiles }: Props) {
  const [mode, setMode] = useState<PromptMode>("detailed");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState<Record<PromptMode, string> | null>(null);

  const prompts = useMemo<Record<PromptMode, string>>(() => {
    if (regenerated) return regenerated;
    return {
      quick: buildClientMasterPrompt({ mode: "quick", owner, repo, branch, treeEntries, analysisFiles, fallback: masterPrompt }),
      detailed: masterPrompt || buildClientMasterPrompt({ mode: "detailed", owner, repo, branch, treeEntries, analysisFiles, fallback: "" }),
      developer: buildClientMasterPrompt({ mode: "developer", owner, repo, branch, treeEntries, analysisFiles, fallback: "" }),
    };
  }, [regenerated, masterPrompt, owner, repo, branch, treeEntries, analysisFiles]);

  const current = prompts[mode];
  const approximateTokens = Math.ceil(current.length / 3.6);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/repository/${owner}/${repo}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      if (res.ok) {
        const data = (await res.json()) as { masterPrompt?: string };
        if (data.masterPrompt) {
          setRegenerated({ ...prompts, detailed: data.masterPrompt });
        }
      }
    } finally {
      setRegenerating(false);
    }
  };

  const download = () => {
    const blob = new Blob([current], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repo}-${mode}-prompt.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prompt mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              title={m.description}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text)]"
              }`}
              aria-pressed={mode === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="font-mono">~{approximateTokens.toLocaleString()} tokens</Badge>
          <CopyButton text={current} label="Copy Prompt" size="default" />
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="h-3.5 w-3.5" /> Download TXT
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void regenerate()} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Paste this prompt into ChatGPT, Claude, Gemini, Cursor, or Codex to work with this codebase.
      </p>

      <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-relaxed">
        {current}
      </pre>
    </div>
  );
}
