/**
 * Hybrid retrieval for chat: vector similarity + keyword scoring,
 * normalized and combined, under a strict token budget.
 */
import { estimateTokens, MAX_CHAT_CONTEXT_TOKENS } from "@/lib/ingestion/tokenizer";

export interface RetrievableChunk {
  id: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding: number[];
}

export interface RetrievalHit {
  chunk: Omit<RetrievableChunk, "embedding">;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .filter((t) => t.length > 2);
}

/**
 * Scores chunks by combined vector + keyword relevance and returns the
 * best set under the token budget.
 */
export function retrieveChunks(
  query: string,
  queryEmbedding: number[],
  chunks: RetrievableChunk[],
  budgetTokens = MAX_CHAT_CONTEXT_TOKENS,
): RetrievalHit[] {
  const queryTerms = new Set(tokenize(query));
  const scored = chunks.map((chunk) => {
    const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    const chunkTerms = tokenize(`${chunk.path} ${chunk.content}`);
    let overlap = 0;
    for (const term of chunkTerms) {
      if (queryTerms.has(term)) overlap++;
    }
    const keywordScore = chunkTerms.length > 0 ? overlap / Math.sqrt(chunkTerms.length) : 0;
    return { chunk, vectorScore, keywordScore, score: 0.75 * vectorScore + 0.25 * keywordScore };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: RetrievalHit[] = [];
  let used = 0;
  const perFile = new Map<string, number>();
  const MAX_PER_FILE = 4;

  for (const s of scored) {
    if (s.score <= 0.05) continue;
    const fileCount = perFile.get(s.chunk.path) ?? 0;
    if (fileCount >= MAX_PER_FILE) continue;
    const tokens = estimateTokens(s.chunk.content);
    if (used + tokens > budgetTokens) continue;
    used += tokens;
    perFile.set(s.chunk.path, fileCount + 1);
    selected.push({ chunk: s.chunk, score: s.score });
    if (selected.length >= 24) break;
  }
  return selected;
}

export function formatRetrievedContext(hits: RetrievalHit[]): string {
  if (hits.length === 0) return "(no directly relevant code found; answer from general repository knowledge)";
  return hits
    .map((h) => `--- ${h.chunk.path} (lines ${h.chunk.startLine}-${h.chunk.endLine}) ---\n${h.chunk.content}`)
    .join("\n\n");
}
