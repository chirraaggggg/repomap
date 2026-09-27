import { NextRequest } from "next/server";
import { runIngestion } from "@/lib/ingestion/pipeline";
import { runAnalysis } from "@/lib/ai/analyze";
import { generateAllPromptModes } from "@/lib/ai/master-prompt";
import { saveAnalysis } from "@/lib/database/store";
import { chunkFiles, toRepositoryChunks } from "@/lib/embeddings/chunker";
import { embedTexts } from "@/lib/embeddings/service";
import { getAIProvider } from "@/lib/ai/gemini";
import { getClientKey, rateLimit } from "@/lib/security/rate-limit";
import { toErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const rl = rateLimit(getClientKey(request, "refresh"), 3, 5 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: { code: "RATE_LIMIT", message: "Too many refreshes. Wait a few minutes." } }, { status: 429 });
  }

  try {
    const { owner, repo } = await params;
    const body = (await request.json().catch(() => ({}))) as { branch?: string };

    const ingestion = await runIngestion(owner, repo, body.branch, { onStep: () => {} });
    const analysis = await runAnalysis(ingestion);
    const prompts = generateAllPromptModes(ingestion, analysis);

    let chunks: Array<Parameters<typeof saveAnalysis>[0]["chunks"][number]> = [];
    try {
      const raw = chunkFiles(
        ingestion.ingestedFiles.map((f) => ({ path: f.path, content: f.content, language: f.language })),
      ).slice(0, 300);
      const embeddings = await embedTexts(getAIProvider(), raw.map((c) => c.content));
      chunks = toRepositoryChunks(raw, "pending").map((c, i) => ({ ...c, embedding: embeddings[i] ?? [] }));
    } catch {
      // embeddings best-effort
    }

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
      payload: {
        metadata: ingestion.metadata,
        stats: ingestion.stats,
        commitSha: ingestion.commitSha,
        treeEntries: ingestion.tree.entries,
        ...analysis,
      },
      masterPrompt: prompts.detailed,
    });

    return Response.json({
      repository: saved,
      analysis: { ...analysis },
      masterPrompt: prompts.detailed,
    });
  } catch (err) {
    return toErrorResponse(err, "api.repository.refresh");
  }
}
