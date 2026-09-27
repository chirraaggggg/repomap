/**
 * Splits file content into overlapping, line-aligned chunks for embedding.
 */
import type { RepositoryChunk } from "@/types";

export interface ChunkOptions {
  maxChunkLines: number;
  overlapLines: number;
  maxChunkChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChunkLines: 60,
  overlapLines: 10,
  maxChunkChars: 3_000,
};

export interface RawChunk {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string | null;
}

export function chunkFile(
  path: string,
  content: string,
  language: string | null,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): RawChunk[] {
  const lines = content.split("\n");
  const chunks: RawChunk[] = [];
  const step = Math.max(1, options.maxChunkLines - options.overlapLines);

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + options.maxChunkLines, lines.length);
    const slice = lines.slice(start, end);
    let text = slice.join("\n");
    if (text.length > options.maxChunkChars) {
      text = `${text.slice(0, options.maxChunkChars)}\n/* … chunk truncated … */`;
    }
    if (text.trim().length === 0) continue;
    chunks.push({
      path,
      content: text,
      startLine: start + 1,
      endLine: end,
      language,
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

export function chunkFiles(
  files: Array<{ path: string; content: string; language: string | null }>,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): RawChunk[] {
  return files.flatMap((f) => chunkFile(f.path, f.content, f.language, options));
}

export function toRepositoryChunks(raw: RawChunk[], repositoryId: string, fileId: string | null = null): RepositoryChunk[] {
  return raw.map((c, i) => ({
    id: `${repositoryId}:${c.path}:${c.startLine}:${i}`,
    fileId,
    repositoryId,
    path: c.path,
    content: c.content,
    startLine: c.startLine,
    endLine: c.endLine,
    language: c.language,
  }));
}
