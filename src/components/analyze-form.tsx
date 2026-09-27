"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, GitFork, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeRepository, validateRepoUrl } from "@/lib/api-client";
import { buildChatFiles, saveAnalysisToSessionStorage } from "@/lib/analysis-storage";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { id: "metadata", label: "Fetching repository…", status: "pending" },
  { id: "tree", label: "Reading file tree…", status: "pending" },
  { id: "filter", label: "Filtering files…", status: "pending" },
  { id: "fetch", label: "Reading relevant files…", status: "pending" },
  { id: "stats", label: "Calculating statistics…", status: "pending" },
  { id: "client-detect", label: "Detecting tech stack…", status: "pending" },
  { id: "context", label: "Building repository context…", status: "pending" },
  { id: "ai", label: "Generating project understanding…", status: "pending" },
  { id: "indexing", label: "Indexing for chat…", status: "pending" },
];

export function AnalyzeForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const abortRef = useRef<AbortController | null>(null);

  const upsert = useCallback((next: { id: string; label: string; status: string; detail?: string }) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.id === next.id);
      if (index === -1) return prev;
      const copy = [...prev];
      copy[index] = {
        id: next.id,
        label: next.label || copy[index]!.label,
        status: (["pending", "active", "done", "error"] as const).includes(next.status as Step["status"])
          ? (next.status as Step["status"])
          : copy[index]!.status,
        detail: next.detail ?? copy[index]!.detail,
      };
      return copy;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) {
        setError("Enter a valid GitHub repository URL.");
        return;
      }
      setError(null);
      setRunning(true);
      setSteps(INITIAL_STEPS.map((s) => ({ ...s })));

      try {
        // Quick existence check for early, precise errors.
        await validateRepoUrl(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enter a valid GitHub repository URL.");
        setRunning(false);
        return;
      }

      abortRef.current = analyzeRepository(trimmed, {
        onProgress: upsert,
        onError: (message) => {
          setError(message);
          setRunning(false);
        },
        onDone: (result) => {
          // Persist before navigating so the repository page always finds the
          // analysis — sessionStorage survives navigation and refresh.
          saveAnalysisToSessionStorage({
            repository: result.repository,
            payload: result.payload,
            masterPrompt: result.masterPrompt,
            ingestedPaths: result.files.map((f) => f.path),
            chatFiles: buildChatFiles(result.files),
            branch: result.repository.branch,
            storedAt: new Date().toISOString(),
          });
          router.push(result.url);
        },
      });
    },
    [url, router, upsert],
  );

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <GitFork className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="github.com/owner/repository"
            aria-label="GitHub repository URL"
            autoComplete="off"
            spellCheck={false}
            className="h-12 pl-10 text-base"
            disabled={running}
          />
        </div>
        <Button type="submit" size="lg" variant="accent" disabled={running} className="h-12">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Analyze Repository
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-[var(--danger)]">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {running ? (
        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <ol className="space-y-2" aria-live="polite">
            {steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2.5 text-sm">
                {step.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
                ) : step.status === "active" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                ) : step.status === "error" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--border-strong)]" />
                )}
                <span className={cn(step.status === "pending" ? "text-[var(--text-muted)]" : "text-[var(--text)]")}>
                  {step.label}
                </span>
                {step.detail ? <span className="text-xs text-[var(--text-secondary)]">{step.detail}</span> : null}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setRunning(false);
            }}
            className="mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        Example:
        <button
          type="button"
          className="inline-flex items-center gap-1 font-mono text-[var(--text-secondary)] hover:text-accent"
          onClick={() => setUrl("https://github.com/vercel/next.js")}
        >
          github.com/vercel/next.js
          <ArrowRight className="h-3 w-3" />
        </button>
      </p>
    </div>
  );
}
