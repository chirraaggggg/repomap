/**
 * Typed client-side API helpers.
 */
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

export interface AnalyzeHandlers {
  onProgress: (step: { id: string; label: string; status: string; detail?: string }) => void;
  onError: (message: string) => void;
  onDone: (url: string) => void;
}

/** Consumes the SSE stream from /api/analyze. */
export function analyzeRepository(url: string, handlers: AnalyzeHandlers): AbortController {
  const controller = new AbortController();
  void (async () => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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
          const data = JSON.parse(dataLine) as { message?: string; url?: string; id?: string; label?: string; status?: string; detail?: string };
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
            handlers.onDone(data.url ?? "/");
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
): Promise<{ explanation: string }> {
  const res = await fetch(`/api/repository/${owner}/${repo}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, action, branch }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function askChat(
  owner: string,
  repo: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  branch?: string,
): Promise<{ text: Promise<string>; references: () => string[] }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, question, history, branch }),
  });
  if (!res.ok || !res.body) await parseError(res);

  const refsHeader = res.headers.get("X-File-References");
  let references: string[] = [];
  try {
    references = refsHeader ? (JSON.parse(refsHeader) as string[]) : [];
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
        full += decoder.decode(value, { stream: true });
      }
      resolve(full);
    })();
  });
  return { text, references: () => references };
}

export async function refreshAnalysis(owner: string, repo: string, branch?: string): Promise<void> {
  const res = await fetch(`/api/repository/${owner}/${repo}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });
  if (!res.ok) await parseError(res);
}
