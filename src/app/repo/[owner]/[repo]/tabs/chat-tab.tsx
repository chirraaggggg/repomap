"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askChat, useByokFields } from "@/lib/api-client";
import { loadAnalysisFromSessionStorage } from "@/lib/analysis-storage";
import type { ChatReference } from "@/types";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  references: ChatReference[];
}

const SUGGESTED = [
  "What does this project do?",
  "Explain the architecture.",
  "How does authentication work?",
  "Explain the main data flow.",
  "Where should I start reading?",
  "How do I run this locally?",
  "How would I add a new feature?",
];

export function ChatTab({
  owner,
  repo,
  branch,
  onOpenFile,
}: {
  owner: string;
  repo: string;
  branch: string;
  onOpenFile?: (path: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const byok = useByokFields();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message in view as streaming content grows the pane.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || streaming) return;
      setInput("");
      setStreaming(true);

      setMessages((prev) => [...prev, { role: "user", content: q, references: [] as ChatReference[] }, { role: "assistant", content: "", references: [] as ChatReference[] }]);

      try {
        // Chat needs repository context server-side; pass locally stored files
        // so it works even when the server's in-memory store is cold.
        const stored = loadAnalysisFromSessionStorage(owner, repo, branch);
        const localFiles = (stored?.chatFiles ?? []).map((f) => ({
          path: f.path,
          content: f.content,
        }));
        const { text, references } = await askChat(owner, repo, q, historyRef.current, branch, localFiles, (delta, fullSoFar) => {
          // Server streams token-level deltas; append them as they arrive so
          // the answer renders progressively instead of all at once.
          void delta;
          setMessages((prev) => {
            const copy = [...prev];
            const target = copy.length - 1;
            const last = copy[target];
            if (last && last.role === "assistant") copy[target] = { role: "assistant", content: fullSoFar, references: [] };
            return copy;
          });
        }, byok);
        const full = await text;
        const refs = references();
        setMessages((prev) => {
          const copy = [...prev];
          const target = copy.length - 1;
          const last = copy[target];
          if (last && last.role === "assistant") copy[target] = { role: "assistant", content: full, references: refs };
          return copy;
        });
        historyRef.current = (
          [...historyRef.current, { role: "user" as const, content: q }, { role: "assistant" as const, content: full }]
        ).slice(-12);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chat failed";
        setMessages((prev) => {
          const copy = [...prev];
          const target = copy.length - 1;
          if (copy[target]) copy[target] = { role: "assistant", content: `Error: ${message}`, references: [] };
          return copy;
        });
      } finally {
        setStreaming(false);
      }
    },
    [owner, repo, branch, streaming, byok],
  );

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" style={{ minHeight: "45vh", maxHeight: "65vh" }}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-lg font-medium">Ask anything about this repository.</p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-accent text-white" : "border border-[var(--border)] bg-[var(--surface-2)]",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.references.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
                    {m.references.map((reference, index) => (
                      <button
                        key={`${reference.path}-${index}`}
                        type="button"
                        onClick={onOpenFile ? () => onOpenFile(reference.path) : undefined}
                        disabled={!onOpenFile}
                        title={onOpenFile ? `Open ${reference.path} in Files` : reference.path}
                        className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px] text-accent hover:underline disabled:cursor-default"
                      >
                        {reference.path}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {streaming && messages.at(-1)?.content === "" ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching repository context…
          </div>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2 border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this codebase…"
          aria-label="Ask a question about this repository"
          className="h-10 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          disabled={streaming}
        />
        <Button type="submit" size="icon" variant="accent" disabled={streaming || !input.trim()} aria-label="Send">
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
