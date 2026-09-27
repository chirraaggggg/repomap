/**
 * End-to-end ingestion pipeline:
 * metadata → tree → filter → prioritize → fetch → stats → context.
 */
import { fetchRepositoryMetadata } from "@/lib/github/repository";
import { fetchRepositoryTree } from "@/lib/github/tree";
import { getMultipleFileContents } from "@/lib/github/client";
import { filterTree, DEFAULT_LIMITS } from "./filter";
import { rankFiles } from "./prioritize";
import { computeStats } from "./stats";
import { buildRepositoryContext } from "./context-builder";
import { detectLanguage } from "./languages";
import { detectTechStack } from "@/lib/ai/tech-stack";
import type {
  IngestedFile,
  IngestionResult,
  ProgressStep,
  ScoredFile,
} from "@/types";

export interface PipelineCallbacks {
  onStep: (step: ProgressStep) => void;
  signal?: AbortSignal;
}

export interface PipelineDeps {
  fetchMetadata: typeof fetchRepositoryMetadata;
  fetchTree: typeof fetchRepositoryTree;
  fetchContents: typeof getMultipleFileContents;
}

export function defaultDeps(): PipelineDeps {
  return {
    fetchMetadata: (owner: string, repo: string, branch?: string) => fetchRepositoryMetadata(owner, repo, branch),
    fetchTree: (owner: string, repo: string, ref: string) => fetchRepositoryTree(owner, repo, ref),
    fetchContents: (owner: string, repo: string, branch: string, paths: string[], opts?: { concurrency?: number; signal?: AbortSignal }) =>
      getMultipleFileContents(owner, repo, branch, paths, opts),
  };
}

export async function runIngestion(
  owner: string,
  repo: string,
  branchOrUndefined: string | undefined,
  callbacks: PipelineCallbacks,
  deps: PipelineDeps = defaultDeps(),
): Promise<IngestionResult> {
  const { onStep } = callbacks;

  // 1. Metadata
  onStep({ id: "metadata", label: "Fetching repository…", status: "active" });
  const { metadata, commitSha } = await deps.fetchMetadata(owner, repo, branchOrUndefined);
  onStep({ id: "metadata", label: "Fetching repository…", status: "done", detail: `✓ ${metadata.fullName} found` });

  if (metadata.isPrivate) {
    throw new Error("This repository appears to be private. Private repositories require GitHub authentication.");
  }

  // 2. Tree
  onStep({ id: "tree", label: "Reading file tree…", status: "active" });
  const { entries, truncated: treeTruncated } = await deps.fetchTree(owner, repo, metadata.branch);
  onStep({
    id: "tree",
    label: "Reading file tree…",
    status: "done",
    detail: `✓ ${entries.length} files discovered`,
  });

  // 3. Filter + prioritize
  onStep({ id: "filter", label: "Filtering files…", status: "active" });
  const { included, ignored } = filterTree(entries, DEFAULT_LIMITS);
  const ranked = rankFiles(included);
  onStep({
    id: "filter",
    label: "Filtering files…",
    status: "done",
    detail: `✓ ${ranked.length} relevant files`,
  });

  // 4. Fetch contents (bounded)
  onStep({ id: "fetch", label: "Reading relevant files…", status: "active" });
  const budget = Math.min(ranked.length, DEFAULT_LIMITS.maxFiles);
  const paths = ranked.slice(0, budget).map((f) => f.entry);
  const contents = await deps.fetchContents(owner, repo, metadata.branch, paths.map((e) => e.path), {
    signal: callbacks.signal,
  });
  const ingestedFiles: IngestedFile[] = [];
  for (const entry of paths) {
    const content = contents.get(entry.path);
    if (content === undefined) continue;
    const score = ranked.find((r) => r.entry.path === entry.path)?.score ?? 30;
    ingestedFiles.push({
      path: entry.path,
      language: detectLanguageFor(entry.path),
      size: content.length,
      content,
      score,
      lines: content.split("\n").length,
      truncated: false,
    });
  }
  onStep({
    id: "fetch",
    label: "Reading relevant files…",
    status: "done",
    detail: `✓ ${ingestedFiles.length} files read`,
  });

  // 5. Stats
  onStep({ id: "stats", label: "Calculating statistics…", status: "active" });
  const scoredIncluded: ScoredFile[] = ranked.slice(0, budget).map((r) => ({
    entry: r.entry,
    score: r.score,
    language: detectLanguageFor(r.entry.path),
  }));
  const stats = computeStats(entries, scoredIncluded, ingestedFiles);
  onStep({ id: "client-detect", label: "Detecting tech stack…", status: "active" });
  const techStack = detectTechStack(ingestedFiles, metadata);
  onStep({ id: "client-detect", label: "Detecting tech stack…", status: "done", detail: `✓ ${techStack.length} technologies detected` });

  // 6. Context
  onStep({ id: "context", label: "Building repository context…", status: "active" });
  const built = buildRepositoryContext(metadata, ingestedFiles, entries);
  onStep({ id: "context", label: "Building repository context…", status: "done", detail: `✓ ${built.contextTokens} tokens` });

  return {
    metadata,
    commitSha,
    tree: { branch: metadata.branch, truncated: treeTruncated, entries },
    included: scoredIncluded,
    ignored,
    stats,
    techStack,
    ingestedFiles,
    context: built.context,
    contextTokens: built.contextTokens,
    truncated: built.truncated,
  };
}

function detectLanguageFor(path: string): string | null {
  return detectLanguage(path);
}
