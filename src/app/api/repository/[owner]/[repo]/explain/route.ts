import { NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/provider";
import { loadAnalysis } from "@/lib/database/store";
import { getFileContent } from "@/lib/github/client";
import { toErrorResponse, AppError } from "@/lib/errors";
import { getClientKey, rateLimit } from "@/lib/security/rate-limit";
import { MAX_CHAT_CONTEXT_TOKENS } from "@/lib/ingestion/tokenizer";
import { estimateTokens } from "@/lib/ingestion/tokenizer";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  path: z.string().min(1).max(500),
  branch: z.string().max(200).optional(),
  action: z.enum(["explain", "references"]).default("explain"),
});

const EXPLAIN_SYSTEM = `You are a senior engineer explaining a file from a GitHub repository.
Ground every statement in the actual file content provided. Reference function/section names.
If the file is too small or generic to explain meaningfully, say so briefly.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const rl = rateLimit(getClientKey(request, "explain"), 20, 5 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: { code: "RATE_LIMIT", message: "Too many requests." } }, { status: 429 });
  }

  try {
    const { owner, repo } = await params;
    const body = BodySchema.parse(await request.json());

    // Prefer ingested content; fall back to GitHub fetch.
    let content: string | null = null;
    const loaded = await loadAnalysis(owner, repo, body.branch);
    const ingested = loaded?.files.find((f) => f.path === body.path);
    if (ingested) {
      content = ingested.content;
    } else {
      const branch = body.branch ?? loaded?.repository.branch;
      if (!branch) throw new AppError("BAD_REQUEST", "Repository not analyzed and no branch provided.");
      content = await getFileContent(owner, repo, branch, body.path);
    }
    if (content === null) throw new AppError("NOT_FOUND", "File not found.");

    const maxChars = MAX_CHAT_CONTEXT_TOKENS * 3;
    const trimmed = content.length > maxChars ? `${content.slice(0, maxChars)}\n/* … truncated … */` : content;

    const provider = getAIProvider();
    const prompt =
      body.action === "explain"
        ? `Explain what this file does, its role in the repository, key functions/components, and how other code likely uses it. Be concise and technical.\n\nFile path: ${body.path}\n\n\`\`\`\n${trimmed}\n\`\`\``
        : `List the exported symbols, classes, or functions defined in this file and where they are most likely referenced from, based on imports and naming. Format as a bullet list.\n\nFile path: ${body.path}\n\n\`\`\`\n${trimmed}\n\`\`\``;

    const text = await provider.generateText(prompt, { system: EXPLAIN_SYSTEM, temperature: 0.2, maxOutputTokens: 1_500, reasoningEffort: "low" });
    return Response.json({ explanation: text, tokens: estimateTokens(trimmed) });
  } catch (err) {
    return toErrorResponse(err, "api.repository.explain");
  }
}
