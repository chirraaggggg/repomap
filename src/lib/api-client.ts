/**
 * Typed client-side API helpers.
 */
import type { AnalysisPayload, ChatReference, RepositoryRecord } from "@/types";
import { useAISettings } from "@/components/ai/ai-settings-context";
import { getByokFields } from "@/lib/byok";

/**
 * Hook: builds the BYOK request fields from the session-only settings context.
 * The key travels in the HTTPS request body only — never a URL, never storage.
 */
export function useByokFields(): { aiProvider?: string; aiApiKey?: string } {
  const { settings, isByok } = useAISettings();
  if (!isByok || (settings.provider !== "groq" && settings.provider !== "openrouter") || !settings.apiKey) {
    return {};
  }
  return { aiProvider: settings.provider, aiApiKey: settings.apiKey };
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body.error?.message) message = body.error.message;
  } catch {
    // non-JSON body
  }
  throw new Error(message);
}

export async function validateRepoUrl(url: string): Promise<{ owner: string; repo: string; branch: string }> {
  const res = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

/** Full analysis result delivered with the final SSE `done` event. */
export interface AnalyzeResult {
  url: string;
  repository: RepositoryRecord;
  payload: AnalysisPayload;
  masterPrompt: string;
  files: Array<{ path: string; content: string; importanceScore: number }>;
}

export interface AnalyzeHandlers {
  onProgress: (step: { id: string; label: string; status: string; detail?: string }) => void;
  onError: (message: string) => void;
  onDone: (result: AnalyzeResult) => void;
}

/** Consumes the SSE stream from /api/analyze. */
export function analyzeRepository(url: string, handlers: AnalyzeHandlers, byok?: { aiProvider?: string; aiApiKey?: string }): AbortController {
  const controller = new AbortController();
  void (async () => {
    try {
      // BYOK fields come from the session-only supplier (set by AISettingsGate);
      // the optional argument is honored when a caller passes credentials directly.
      const fields = byok ?? getByokFields();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...fields }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        await parseError(res);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const lines = evt.split("\n");
          const event = lines.find((l) => l.startsWith("event: "))?.slice(7).trim();
          const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6);
          if (!event || !dataLine) continue;
          const data = JSON.parse(dataLine) as { message?: string; url?: string; repository?: RepositoryRecord; payload?: AnalysisPayload; masterPrompt?: string; files?: Array<{ path: string; content: string; importanceScore: number }>; id?: string; label?: string; status?: string; detail?: string };
          if (event === "progress") {
            handlers.onProgress({
              id: data.id ?? "",
              label: data.label ?? "",
              status: data.status ?? "active",
              detail: data.detail,
            });
          } else if (event === "error") {
            handlers.onError(data.message ?? "Analysis failed");
          } else if (event === "done") {
            // Never navigate without the analysis payload: the destination
            // page would render its "No analysis yet" state.
            if (!data.repository || !data.payload || !data.url) {
              handlers.onError("Analysis finished but the result payload was missing. Please try again.");
              return;
            }
            handlers.onDone({
              url: data.url,
              repository: data.repository,
              payload: data.payload,
              masterPrompt: data.masterPrompt ?? "",
              files: data.files ?? [],
            });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      handlers.onError(err instanceof Error ? err.message : "Analysis failed");
    }
  })();
  return controller;
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<{ path: string; language: string | null; content: string; lines: number; ingested: boolean; importance?: number }> {
  const params = new URLSearchParams({ path });
  if (branch) params.set("branch", branch);
  const res = await fetch(`/api/repository/${owner}/${repo}/files?${params.toString()}`);
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function explainFile(
  owner: string,
  repo: string,
  path: string,
  action: "explain" | "references" = "explain",
  branch?: string,
  byok?: { aiProvider?: string; aiApiKey?: string },
): Promise<{ explanation: string }> {
  const res = await fetch(`/api/repository/${owner}/${repo}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, action, branch, ...byok }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

/**
 * Normalizes legacy/stored references (plain strings) into the canonical
 * ChatReference shape. Called once at the API boundary only.
 */
function normalizeChatReferences(raw: unknown): ChatReference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((reference) => {
      if (typeof reference === "string") return { path: reference };
      if (typeof reference === "object" && reference !== null && typeof (reference as { path?: unknown }).path === "string") {
        return { path: (reference as { path: string }).path };
      }
      return null;
    })
    .filter((r): r is ChatReference => r !== null);
}

export async function askChat(
  owner: string,
  repo: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  branch?: string,
  localFiles: Array<{ path: string; content: string }> = [],
  onDelta?: (delta: string, fullSoFar: string) => void,
  byok?: { aiProvider?: string; aiApiKey?: string },
): Promise<{ text: Promise<string>; references: () => ChatReference[] }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, question, history, branch, localFiles, ...byok }),
  });
  if (!res.ok || !res.body) await parseError(res);

  const refsHeader = res.headers.get("X-File-References");
  let references: ChatReference[] = [];
  try {
    references = refsHeader ? normalizeChatReferences(JSON.parse(refsHeader)) : [];
  } catch {
    references = [];
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const text = new Promise<string>((resolve) => {
    void (async () => {
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        full += delta;
        onDelta?.(delta, full);
      }
      resolve(full);
    })();
  });
  return { text, references: () => references };
}

export async function refreshAnalysis(
  owner: string,
  repo: string,
  branch?: string,
  byok?: { aiProvider?: string; aiApiKey?: string },
): Promise<void> {
  const res = await fetch(`/api/repository/${owner}/${repo}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, ...byok }),
  });
  if (!res.ok) await parseError(res);
}
