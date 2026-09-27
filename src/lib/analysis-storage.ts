/**
 * Browser-session persistence for analyses (no-database MVP).
 * sessionStorage survives navigation and refresh within the tab, so the
 * repository page can render the analysis it was navigated with.
 *
 * Stores only generated analysis data for public repositories — never
 * API keys, tokens, headers, or cookies.
 */
import type { AnalysisPayload, RepositoryRecord } from "@/types";

const PREFIX = "repomap:analysis:";

/** Deterministic per-repository key: owner/repo are case-insensitive on GitHub. */
export function analysisStorageKey(owner: string, repo: string, branch?: string): string {
  const branchPart = branch ? branch : "default";
  return `${PREFIX}${owner.toLowerCase()}/${repo.toLowerCase()}:${branchPart}`;
}

export interface StoredAnalysis {
  repository: RepositoryRecord;
  payload: AnalysisPayload;
  masterPrompt: string;
  /** File paths (not contents) that were indexed — chat fallback + Files tab hints. */
  ingestedPaths: string[];
  /** Trimmed file contents for chat retrieval when the server store is cold. */
  chatFiles: Array<{ path: string; content: string }>;
  branch: string;
  storedAt: string;
}

/** Maximum chat file payload kept locally, in characters (~300 KB). */
const MAX_CHAT_FILES_CHARS = 300_000;

/** Builds the compact chat-file set: prioritized files under a char budget. */
export function buildChatFiles(
  files: Array<{ path: string; content: string; importanceScore?: number }>,
  maxFiles = 40,
): Array<{ path: string; content: string }> {
  const sorted = [...files].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
  const picked: Array<{ path: string; content: string }> = [];
  let used = 0;
  for (const f of sorted) {
    if (picked.length >= maxFiles) break;
    if (used + f.content.length > MAX_CHAT_FILES_CHARS) continue;
    used += f.content.length;
    picked.push({ path: f.path, content: f.content });
  }
  return picked;
}

export function saveAnalysisToSessionStorage(stored: StoredAnalysis): void {
  if (typeof window === "undefined") return;
  const key = analysisStorageKey(stored.repository.owner, stored.repository.name, stored.branch);
  try {
    sessionStorage.setItem(key, JSON.stringify(stored));
    console.log("[RepoMap] analysis stored", key);
  } catch {
    // Quota exceeded: retry without the chat file contents.
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ ...stored, chatFiles: stored.chatFiles.slice(0, 10) }),
      );
      console.log("[RepoMap] analysis stored (trimmed chat files)", key);
    } catch {
      console.warn("[RepoMap] sessionStorage unavailable/limited; relying on server cache only");
    }
  }
}

export function loadAnalysisFromSessionStorage(
  owner: string,
  repo: string,
  branch?: string,
): StoredAnalysis | null {
  if (typeof window === "undefined") return null;
  const key = analysisStorageKey(owner, repo, branch);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return parseStored(raw);
  } catch {
    return null;
  }
}

function parseStored(raw: string): StoredAnalysis | null {
  try {
    const parsed = JSON.parse(raw) as StoredAnalysis;
    if (typeof parsed !== "object" || parsed === null || !parsed.payload || !parsed.repository) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Sentinel returned by the server snapshot before hydration. */
export const ANALYSIS_LOADING: { loading: true } = { loading: true };

/**
 * Memoized snapshot cache: React calls getSnapshot repeatedly and requires a
 * stable identity between calls when storage has not changed.
 */
let snapshotCache: { key: string; raw: string | null; parsed: StoredAnalysis | null } | null = null;

/**
 * Stable getSnapshot for useSyncExternalStore. Reads sessionStorage
 * synchronously; re-parses only when the raw value changed.
 */
export function getAnalysisSnapshot(owner: string, repo: string, branch?: string): StoredAnalysis | null {
  const key = analysisStorageKey(owner, repo, branch);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (snapshotCache && snapshotCache.key === key && snapshotCache.raw === raw) {
    return snapshotCache.parsed;
  }
  console.log("[RepoMap] loading analysis", key);
  const parsed = raw ? parseStored(raw) : null;
  console.log("[RepoMap] analysis found:", Boolean(parsed));
  snapshotCache = { key, raw, parsed };
  return parsed;
}

/** No-op subscribe: sessionStorage does not push updates to this tab. */
export function subscribeToAnalysis(): () => void {
  return () => {};
}
