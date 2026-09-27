/**
 * Embedding generation with batching to respect API limits.
 */
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider } from "@/lib/ai/provider";

const BATCH_SIZE = 64;

export async function embedTexts(provider: AIProvider, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      // The provider interface is single-text; batch sequentially per batch item.
      const embeddings = await Promise.all(batch.map((t) => provider.generateEmbedding(t)));
      out.push(...embeddings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("embeddings", `Batch ${i / BATCH_SIZE} failed: ${msg}`);
      throw new AppError("EMBEDDING_ERROR", "Embedding generation failed. Chat retrieval may be degraded.");
    }
  }
  return out;
}

export async function embedQuery(provider: AIProvider, query: string): Promise<number[]> {
  try {
    return await provider.generateEmbedding(query);
  } catch (err) {
    logger.error("embeddings", `Query embedding failed: ${err instanceof Error ? err.message : err}`);
    throw new AppError("EMBEDDING_ERROR", "Failed to embed the question.");
  }
}
