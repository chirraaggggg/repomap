/**
 * Persistence facade. RepoTutor MVP has no database: everything lives in the
 * process-level in-memory store (data is ephemeral per server instance).
 */
import * as memory from "./memory-store";
import { logger } from "@/lib/logger";
import type {
  AnalysisPayload,
  ChatMessage,
  RepositoryChunk,
  RepositoryRecord,
} from "@/types";

export interface AnalysisSaveInput {
  repository: Omit<RepositoryRecord, "id" | "createdAt">;
  files: Array<{
    path: string;
    language: string | null;
    size: number;
    content: string;
    importanceScore: number;
  }>;
  chunks: RepositoryChunk[];
  payload: AnalysisPayload;
  masterPrompt: string;
}

export interface LoadedAnalysis {
  repository: RepositoryRecord;
  payload: AnalysisPayload;
  masterPrompt: string;
  files: Array<{ path: string; language: string | null; size: number; content: string; importanceScore: number }>;
}

export async function saveAnalysis(input: AnalysisSaveInput): Promise<RepositoryRecord> {
  logger.warn("db", "Using in-memory store — analysis data is ephemeral per server instance");
  const repo = memory.memorySaveRepository(input.repository);
  memory.memorySaveFiles(repo.id, input.files);
  // Chunks arrive keyed to a placeholder repository id; re-key them so chat
  // retrieval can find them by the real repository id.
  memory.memorySaveChunks(
    repo.id,
    input.chunks.map((c) => ({
      ...c,
      id: `${repo.id}:${c.path}:${c.startLine}`,
      repositoryId: repo.id,
      fileId: null,
    })),
  );
  memory.memorySaveAnalysis({
    id: crypto.randomUUID(),
    repositoryId: repo.id,
    payload: input.payload,
    masterPrompt: input.masterPrompt,
    createdAt: new Date().toISOString(),
  });
  return repo;
}

export async function loadAnalysis(
  owner: string,
  name: string,
  branch?: string,
): Promise<LoadedAnalysis | null> {
  const repo = memory.memoryGetRepository(owner, name, branch);
  if (!repo) return null;
  const analysis = memory.memoryGetAnalysis(repo.id);
  if (!analysis) return null;
  return {
    repository: repo,
    payload: analysis.payload,
    masterPrompt: analysis.masterPrompt,
    files: memory.memoryGetFiles(repo.id),
  };
}

export async function getRepositoryChunks(repositoryId: string): Promise<RepositoryChunk[]> {
  return memory.memoryGetChunks(repositoryId);
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  memory.memoryAppendMessages(messages);
}

export async function loadChatMessages(sessionKey: string): Promise<ChatMessage[]> {
  return memory.memoryGetMessages(sessionKey);
}
