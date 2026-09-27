import { NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/provider";
import { loadAnalysis } from "@/lib/database/store";
import { getFileContent } from "@/lib/github/client";
import { toErrorResponse, AppError } from "@/lib/errors";
import { getClientKey, rateLimit } from "@/lib/security/rate-limit";
import { MAX_CHAT_CONTEXT_TOKENS, estimateTokens } from "@/lib/ingestion/tokenizer";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  path: z.string().min(1).max(500),
  branch: z.string().max(200).optional(),
  action: z.enum(["explain", "references"]).default("explain"),
});

const EXPLAIN_SYSTEM = `You explain source files to developers who are trying to understand a repository.

Structure your answer with these short sections (use the exact headings):
- What it does
- Why it exists
- Key functions & classes
- Connections (how other code uses it / what it depends on)
- Read next (2-3 specific files from this repository)

Rules:
- Be concise. Short sections, bullet points, no long prose.
- Do not reproduce the source code. Quote at most one short line when essential.
- Do not explain obvious syntax.
- Do not repeat information.
- Prioritize concrete information from the provided source over generalities.`;

const EXPLAIN_TIMEOUT_MS = 60_000;
void EXPLAIN_TIMEOUT_MS; // informational; the provider owns request timeouts

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const rl = rateLimit(getClientKey(request, "explain"), 20, 5 * 60_000);
  if (!rl.ok) {
    return Response.json({ error: { code: "RATE_LIMIT", message: "Too many requests. Please wait a moment." } }, { status: 429 });
  }

  try {
    const { owner, repo } = await params;
    const body = BodySchema.parse(await request.json());

    // Prefer the actual ingested file content; fall back to a GitHub fetch.
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
    if (content === null || content.length === 0) throw new AppError("NOT_FOUND", "File not found.");

    // Cap the file so the request stays inside the free-tier envelope;
    // the completion budget below stays intact for the explanation itself.
    const maxChars = MAX_CHAT_CONTEXT_TOKENS * 3;
    const trimmed = content.length > maxChars ? `${content.slice(0, maxChars)}\n/* … truncated … */` : content;

    const repoLine = loaded
      ? `Repository: ${loaded.repository.owner}/${loaded.repository.name} (branch ${loaded.repository.branch})\n`
      : `Repository: ${owner}/${repo}\n`;
    const contextHint =
      loaded && body.action === "explain"
        ? `Architecture summary for orientation (do not repeat it): ${loaded.payload.architecture}\n`
        : "";

    const prompt =
      body.action === "explain"
        ? `Explain this source file for a developer who is trying to understand the repository.

Cover:
1. What this file does
2. Why it exists
3. Important functions/classes
4. How it connects to the rest of the repository
5. Important implementation details
6. What the developer should read next

${repoLine}${contextHint}
File path: ${body.path}

\`\`\`
${trimmed}
\`\`\``
        : `List the exported symbols, classes, or functions defined in this file and where they are most likely referenced from, based on imports and naming. Format as a concise bullet list.

${repoLine}
File path: ${body.path}

\`\`\`
${trimmed}
\`\`\``;

    const provider = getAIProvider();
    const text = await provider.generateText(prompt, {
      system: EXPLAIN_SYSTEM,
      temperature: 0.2,
      maxOutputTokens: 2_800,
      reasoningEffort: "low",
    });
    return Response.json({ explanation: text, tokens: estimateTokens(trimmed) });
  } catch (err) {
    return toErrorResponse(err, "api.repository.explain");
  }
}
