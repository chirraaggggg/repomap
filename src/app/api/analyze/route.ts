import { NextRequest } from "next/server";
import { runIngestion } from "@/lib/ingestion/pipeline";
import { runAnalysis } from "@/lib/ai/analyze";
import { generateAllPromptModes } from "@/lib/ai/master-prompt";
import { saveAnalysis } from "@/lib/database/store";
import { chunkFiles, toRepositoryChunks } from "@/lib/embeddings/chunker";
import { validateRepoInput } from "@/lib/security/validate";
import { getClientKey, rateLimit } from "@/lib/security/rate-limit";
import { toErrorResponse, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AnalysisPayload, RepositoryChunk } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ANALYZE_LIMIT = 5;      // per window per IP
const WINDOW_MS = 5 * 60_000;

export async function POST(request: NextRequest) {
  const rl = rateLimit(getClientKey(request, "analyze"), ANALYZE_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: { code: "RATE_LIMIT", message: "Too many analyses. Please wait a few minutes." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Enter a valid GitHub repository URL." } },
      { status: 400 },
    );
  }

  let owner: string;
  let repo: string;
  let branch: string | undefined;
  try {
    const input = validateRepoInput(body);
    owner = input.owner;
    repo = input.repo;
    branch = input.branch;
  } catch (err) {
    return toErrorResponse(err, "analyze.validate");
  }

  // SSE stream of progress steps, then the final result URL + full analysis.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const ingestion = await (async () => {
        try {
          return await runIngestion(owner, repo, branch, {
            onStep: (step) => send("progress", step),
          });
        } catch (err) {
          send("error", { message: err instanceof Error ? err.message : "Ingestion failed" });
          controller.close();
          return null;
        }
      })();
      if (!ingestion) return;

      try {
        send("progress", { id: "ai", label: "Generating project understanding…", status: "active" });
        const analysis = await runAnalysis(ingestion);
        send("progress", { id: "ai", label: "Generating project understanding…", status: "done", detail: "✓ Analysis complete" });

        // Chunk best-effort: chat retrieval works from these chunks.
        send("progress", { id: "indexing", label: "Indexing for chat…", status: "active" });
        let chunks: RepositoryChunk[] = [];
        try {
          const rawChunks = chunkFiles(
            ingestion.ingestedFiles.map((f) => ({ path: f.path, content: f.content, language: f.language })),
          ).slice(0, 300);
          chunks = toRepositoryChunks(rawChunks, "pending");
        } catch (err) {
          logger.warn("analyze", "Chunking failed; chat will use file-level retrieval", err instanceof Error ? err.message : err);
        }

        const prompts = generateAllPromptModes(ingestion, analysis);
        const payload: AnalysisPayload = {
          metadata: ingestion.metadata,
          stats: ingestion.stats,
          commitSha: ingestion.commitSha,
          treeEntries: ingestion.tree.entries,
          ...analysis,
        };
        const saved = await saveAnalysis({
          repository: {
            owner,
            name: repo,
            url: `https://github.com/${owner}/${repo}`,
            branch: ingestion.metadata.branch,
            commitSha: ingestion.commitSha,
          },
          files: ingestion.ingestedFiles.map((f) => ({
            path: f.path,
            language: f.language,
            size: f.size,
            content: f.content,
            importanceScore: f.score,
          })),
          chunks,
          payload,
          masterPrompt: prompts.detailed,
        });

        send("progress", { id: "indexing", label: "Indexing for chat…", status: "done", detail: "✓ Indexed for chat" });

        // The client stores this payload in sessionStorage before navigating,
        // so the repository page can render without depending on server state.
        send("done", {
          url: `/repo/${owner}/${repo}?branch=${encodeURIComponent(ingestion.metadata.branch)}`,
          repository: saved,
          payload,
          masterPrompt: prompts.detailed,
          files: ingestion.ingestedFiles.map((f) => ({
            path: f.path,
            content: f.content,
            importanceScore: f.score,
          })),
        });
      } catch (err) {
        // AppError messages are already user-safe and specific (rate limit,
        // context too large, output too long, …); everything else is generic.
        if (err instanceof AppError) {
          logger.error("analyze", `Analysis failed (${err.code})`, err.message);
          send("error", { message: err.message });
        } else {
          logger.error("analyze", "Analysis failed", err instanceof Error ? err.message : err);
          send("error", { message: "Analysis failed. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
