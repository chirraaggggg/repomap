/**
 * Process-level in-memory store used when Supabase env vars are absent.
 * Data survives per server instance; documented as a development fallback.
 */
import type {
  AnalysisRecord,
  ChatMessage,
  RepositoryRecord,
  RepositoryChunk,
} from "@/types";

interface MemoryEntry {
  repository: RepositoryRecord;
  files: Array<{
    id: string;
    repositoryId: string;
    path: string;
    language: string | null;
    size: number;
    content: string;
    importanceScore: number;
  }>;
  chunks: Array<RepositoryChunk & { embedding: number[] }>;
  analysis: AnalysisRecord | null;
  messages: ChatMessage[];
}

const store = new Map<string, MemoryEntry>();

function repoKey(owner: string, name: string, branch: string): string {
  return `${owner.toLowerCase()}/${name.toLowerCase()}@${branch}`;
}

export function memorySaveRepository(
  repository: Omit<RepositoryRecord, "id" | "createdAt"> & { id?: string },
): RepositoryRecord {
  const key = repoKey(repository.owner, repository.name, repository.branch);
  const existing = store.get(key);
  const record: RepositoryRecord = {
    id: repository.id ?? existing?.repository.id ?? crypto.randomUUID(),
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    branch: repository.branch,
    commitSha: repository.commitSha,
    createdAt: existing?.repository.createdAt ?? new Date().toISOString(),
  };
  const entry = store.get(key) ?? {
    repository: record,
    files: [],
    chunks: [],
    analysis: null,
    messages: [],
  };
  entry.repository = record;
  store.set(key, entry);
  return record;
}

export function memoryGetRepository(owner: string, name: string, branch?: string): RepositoryRecord | null {
  if (branch) return store.get(repoKey(owner, name, branch))?.repository ?? null;
  // latest by createdAt across branches
  let latest: RepositoryRecord | null = null;
  for (const [key, entry] of store) {
    if (!key.startsWith(`${owner.toLowerCase()}/${name.toLowerCase()}@`)) continue;
    if (!latest || entry.repository.createdAt > latest.createdAt) latest = entry.repository;
  }
  return latest;
}

export function memoryGetRepositoryById(id: string): RepositoryRecord | null {
  for (const entry of store.values()) {
    if (entry.repository.id === id) return entry.repository;
  }
  return null;
}

export function memorySaveFiles(
  repositoryId: string,
  files: Array<{
    id?: string;
    repositoryId?: string;
    path: string;
    language: string | null;
    size: number;
    content: string;
    importanceScore: number;
  }>,
): void {
  const entry = findEntryByRepositoryId(repositoryId);
  if (!entry) return;
  entry.files = files.map((f) => ({
    id: f.id ?? crypto.randomUUID(),
    repositoryId: f.repositoryId ?? repositoryId,
    path: f.path,
    language: f.language,
    size: f.size,
    content: f.content,
    importanceScore: f.importanceScore,
  }));
}

export function memoryGetFiles(repositoryId: string): MemoryEntry["files"] {
  const entry = findEntryByRepositoryId(repositoryId);
  return entry?.files ?? [];
}

export function memorySaveChunks(repositoryId: string, chunks: Array<RepositoryChunk & { embedding: number[] }>): void {
  const entry = findEntryByRepositoryId(repositoryId);
  if (!entry) return;
  entry.chunks = chunks;
}

export function memoryGetChunks(repositoryId: string): Array<RepositoryChunk & { embedding: number[] }> {
  return findEntryByRepositoryId(repositoryId)?.chunks ?? [];
}

export function memorySaveAnalysis(analysis: AnalysisRecord): void {
  const entry = findEntryByRepositoryId(analysis.repositoryId);
  if (!entry) return;
  entry.analysis = analysis;
}

export function memoryGetAnalysis(repositoryId: string): AnalysisRecord | null {
  return findEntryByRepositoryId(repositoryId)?.analysis ?? null;
}

export function memoryAppendMessages(messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const first = messages[0];
  if (!first) return;
  const repoId = first.sessionKey.split(":")[0] ?? "";
  const entry = findEntryByRepositoryId(repoId);
  if (!entry) return;
  entry.messages.push(...messages);
}

export function memoryGetMessages(sessionKey: string): ChatMessage[] {
  const repoId = sessionKey.split(":")[0] ?? "";
  const entry = findEntryByRepositoryId(repoId);
  if (!entry) return [];
  return entry.messages.filter((m) => m.sessionKey === sessionKey);
}

function findEntryByRepositoryId(repositoryId: string): MemoryEntry | null {
  for (const entry of store.values()) {
    if (entry.repository.id === repositoryId) return entry;
  }
  return null;
}
