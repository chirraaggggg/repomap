/**
 * Builds the LLM context from ingested files under a strict token budget.
 * Selection strategy: rank by importance, fill until budget, then
 * progressively trim the lowest-value files to include breadth.
 */
import { renderAsciiTree } from "@/lib/github/ascii-tree";
import { estimateTokens, MAX_ANALYSIS_TOKENS } from "./tokenizer";
import type { IngestedFile, RepositoryMetadata, TreeEntry } from "@/types";

export interface ContextBuildResult {
  context: string;
  contextTokens: number;
  usedFiles: IngestedFile[];
  truncated: boolean;
}

const HEADER_BUDGET = 2_000;

export function buildRepositoryContext(
  metadata: RepositoryMetadata,
  files: IngestedFile[],
  treeEntries: TreeEntry[],
  budget = MAX_ANALYSIS_TOKENS - HEADER_BUDGET,
): ContextBuildResult {
  const sorted = [...files].sort((a, b) => b.score - a.score);
  const used: IngestedFile[] = [];
  const parts: string[] = [];
  let tokens = 0;
  let truncated = false;

  const header =
    `# Repository: ${metadata.fullName}\n` +
    `Branch: ${metadata.branch}\n` +
    (metadata.description ? `Description: ${metadata.description}\n` : "") +
    (metadata.language ? `Primary language: ${metadata.language}\n` : "") +
    (metadata.topics.length ? `Topics: ${metadata.topics.join(", ")}\n` : "");

  const treeSection = `## File tree\n${renderAsciiTree(treeEntries.slice(0, 3000), 400)}\n`;

  parts.push(header, treeSection);

  const headerTokens = estimateTokens(header) + estimateTokens(treeSection);
  tokens += headerTokens;

  for (const file of sorted) {
    const fileTokens = estimateTokens(file.content);
    if (tokens + fileTokens > budget) {
      // Try trimming: take a prefix of the file so breadth is preserved.
      const remaining = budget - tokens;
      if (remaining > 500) {
        const maxChars = Math.floor(remaining * 3.6);
        const trimmed = file.content.slice(0, maxChars);
        used.push({ ...file, content: trimmed, truncated: true });
        parts.push(formatFile({ ...file, content: trimmed }));
        tokens += estimateTokens(trimmed);
      }
      truncated = true;
      break; // files after this are even larger (sorted by score; stop at first overflow)
    }
    used.push(file);
    parts.push(formatFile(file));
    tokens += fileTokens;
  }

  return {
    context: parts.join("\n\n"),
    contextTokens: tokens,
    usedFiles: used,
    truncated: tokens >= budget * 0.98 || truncated,
  };
}

function formatFile(file: IngestedFile): string {
  return `### File: ${file.path}\n\`\`\`${(file.language ?? "").toLowerCase()}\n${file.content}\n\`\`\``;
}
