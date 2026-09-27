import { NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/gemini";
import { embedQuery } from "@/lib/embeddings/service";
import { retrieveChunks, formatRetrievedContext, type RetrievableChunk } from "@/lib/embeddings/retrieval";
import { getChunksWithEmbeddings, loadAnalysis, saveChatMessages } from "@/lib/database/store";
import { toErrorResponse, AppError } from "@/lib/errors";
import { getClientKey, rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import type { FileReference } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHAT_LIMIT = 30;
const WINDOW_MS = 5 * 60_000;

const BodySchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  branch: z.string().max(200).optional(),
  question: z.string().min(1).max(2_000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8_000) }))
    .max(12)
    .default([]),
});

const CHAT_SYSTEM = `You are a codebase assistant answering questions about a specific GitHub repository.

Rules:
1. Ground every claim in the provided repository context.
2. Reference actual file paths in your answer using backticks, e.g. \`src/app/page.tsx\`.
3. Never invent functionality, APIs, or code that is not in the context.
4. If the context does not contain the answer, say so and suggest what to look for.
5. Keep answers focused and technical.`;

export async function POST(request: NextRequest) {
  const rl = rateLimit(getClientKey(request, "chat"), CHAT_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: { code: "RATE_LIMIT", message: "Too many questions. Please wait a moment." } },
      { status: 429 },
    );
  }

  try {
    const raw = await request.json();
    const body = BodySchema.parse(raw);

    const loaded = await loadAnalysis(body.owner, body.repo, body.branch);
    if (!loaded) {
      throw new AppError("NOT_FOUND", "Repository analysis not found. Analyze the repository first.");
    }

    const repositoryId = loaded.repository.id;
    const provider = getAIProvider();

    // Retrieval: vector search when embeddings exist, keyword fallback otherwise.
    let context: string;
    let referencedPaths: string[] = [];
    const stored = await getChunksWithEmbeddings(repositoryId);

    if (stored.length > 0) {
      try {
        const queryEmbedding = await embedQuery(provider, body.question);
        const retrievable: RetrievableChunk[] = stored.map((c) => ({
          id: c.id,
          path: c.path,
          content: c.content,
          startLine: c.startLine,
          endLine: c.endLine,
          embedding: c.embedding,
        }));
        const hits = retrieveChunks(body.question, queryEmbedding, retrievable);
        context = formatRetrievedContext(hits);
        referencedPaths = [...new Set(hits.map((h) => h.chunk.path))].slice(0, 8);
      } catch (err) {
        logger.warn("chat", "Vector retrieval failed, using keyword fallback", err instanceof Error ? err.message : err);
        const hits = retrieveChunksKeyword(body.question, stored);
        context = formatRetrievedContext(hits);
        referencedPaths = [...new Set(hits.map((h) => h.chunk.path))].slice(0, 8);
      }
    } else {
      // Keyword fallback over stored files.
      const hits = retrieveFilesKeyword(body.question, loaded.files);
      context = formatRetrievedContext(
        hits.map((f) => ({
          chunk: {
            id: f.path,
            path: f.path,
            content: f.content,
            startLine: 1,
            endLine: f.content.split("\n").length,
          },
          score: 0,
        })),
      );
      referencedPaths = hits.map((f) => f.path).slice(0, 8);
    }

    const historyText = body.history
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n")
      .slice(-4_000);

    const prompt = `${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}Repository: ${body.owner}/${body.repo} (branch ${loaded.repository.branch})

Relevant repository context:
${context}

Question: ${body.question}

Answer the question using only the repository context above. Cite file paths.`;

    const references: FileReference[] = referencedPaths.map((path) => ({ path }));

    // Persist user message (assistant message persisted after stream completes).
    void saveChatMessages([
      {
        id: crypto.randomUUID(),
        sessionKey: `${repositoryId}:default`,
        role: "user",
        content: body.question,
        references: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let full = "";
        try {
          for await (const delta of provider.streamText(prompt, { system: CHAT_SYSTEM, temperature: 0.2 })) {
            full += delta;
            controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "AI request failed";
          logger.error("chat", message);
          controller.enqueue(encoder.encode(`\n\n_[AI error: ${message}]_`));
        } finally {
          void saveChatMessages([
            {
              id: crypto.randomUUID(),
              sessionKey: `${repositoryId}:default`,
              role: "assistant",
              content: full,
              references,
              createdAt: new Date().toISOString(),
            },
          ]);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-File-References": JSON.stringify(references),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return toErrorResponse(err, "chat");
  }
}

function retrieveChunksKeyword(
  question: string,
  chunks: Array<{ id: string; path: string; content: string; startLine: number; endLine: number }>,
) {
  const terms = question.toLowerCase().split(/[^a-z0-9_.]+/).filter((t) => t.length > 2);
  const scored = chunks.map((c) => {
    const haystack = `${c.path} ${c.content}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
    return { chunk: c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => ({ chunk: s.chunk, score: s.score }));
}

function retrieveFilesKeyword(question: string, files: Array<{ path: string; content: string }>, maxContextChars = 40_000) {
  const terms = question.toLowerCase().split(/[^a-z0-9_.]+/).filter((t) => t.length > 2);
  const scored = files.map((f) => {
    const haystack = `${f.path} ${f.content}`.toLowerCase();
    const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
    return { f, score };
  });
  const picked: Array<{ path: string; content: string }> = [];
  let used = 0;
  for (const s of scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)) {
    if (used + s.f.content.length > maxContextChars) continue;
    used += s.f.content.length;
    picked.push(s.f);
    if (picked.length >= 6) break;
  }
  return picked;
}
