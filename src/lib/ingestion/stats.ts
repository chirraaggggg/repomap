/**
 * Repository statistics computed from the actual tree and ingested files.
 * No fabricated values.
 */
import { estimateTokens } from "./tokenizer";
import type { IngestedFile, RepoStats, ScoredFile, TreeEntry } from "@/types";

export function computeStats(
  allEntries: TreeEntry[],
  included: ScoredFile[],
  ingestedFiles: IngestedFile[],
): RepoStats {
  const languageCounts = new Map<string, number>();
  const extCounts = new Map<string, number>();
  let analyzedLines = 0;
  let analyzedSize = 0;

  for (const file of ingestedFiles) {
    analyzedLines += file.lines;
    analyzedSize += file.size;
    if (file.language) {
      languageCounts.set(file.language, (languageCounts.get(file.language) ?? 0) + 1);
    }
  }

  for (const scored of included) {
    const base = scored.entry.path.split("/").pop() ?? scored.entry.path;
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot).toLowerCase() : "(none)";
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }

  const totalAnalyzed = ingestedFiles.length || 1;
  const languages = [...languageCounts.entries()]
    .map(([name, count]) => ({ name, percentage: Math.round((count / totalAnalyzed) * 1000) / 10 }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 8);

  const fileTypes = [...extCounts.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const largestFiles = [...ingestedFiles]
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((f) => ({ path: f.path, size: f.size }));

  return {
    totalFiles: allEntries.filter((e) => e.type === "blob").length,
    analyzedFiles: ingestedFiles.length,
    ignoredFiles: allEntries.length - ingestedFiles.length,
    totalLines: analyzedLines,
    estimatedTokens: estimateTokens(ingestedFiles.map((f) => f.content).join("\n")),
    languages,
    fileTypes,
    sizeBytes: analyzedSize,
    largestFiles,
  };
}
