/**
 * Persistence facade. Uses Supabase when configured; otherwise an
 * in-process memory store so the app remains functional in development.
 */
import { getServerSupabase, isDatabaseConfigured } from "./client";
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
  chunks: Array<RepositoryChunk & { embedding: number[] }>;
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
  const supabase = getServerSupabase();
  if (!supabase) {
    logger.warn("db", "Supabase not configured — using in-memory store (data is ephemeral)");
    const repo = memory.memorySaveRepository(input.repository);
    memory.memorySaveFiles(repo.id, input.files);
    memory.memorySaveChunks(repo.id, input.chunks);
    memory.memorySaveAnalysis({
      id: crypto.randomUUID(),
      repositoryId: repo.id,
      payload: input.payload,
      masterPrompt: input.masterPrompt,
      createdAt: new Date().toISOString(),
    });
    return repo;
  }

  // Upsert repository
  const { data: repoData, error: repoError } = await supabase
    .from("repositories")
    .upsert(
      {
        owner: input.repository.owner,
        name: input.repository.name,
        url: input.repository.url,
        branch: input.repository.branch,
        commit_sha: input.repository.commitSha,
      },
      { onConflict: "owner,name,branch" },
    )
    .select()
    .single();
  if (repoError) throw new Error(`Failed to save repository: ${repoError.message}`);
  const repo = mapRepository(repoData);

  // Replace files
  await supabase.from("repository_files").delete().eq("repository_id", repo.id);
  if (input.files.length > 0) {
    const rows = input.files.map((f) => ({
      repository_id: repo.id,
      path: f.path,
      language: f.language,
      size: f.size,
      content: f.content,
      importance_score: f.importanceScore,
    }));
    const { error } = await supabase.from("repository_files").insert(rows);
    if (error) logger.error("db", `Failed to save files: ${error.message}`);
  }

  // Replace chunks
  await supabase.from("repository_chunks").delete().eq("repository_id", repo.id);
  if (input.chunks.length > 0) {
    const rows = input.chunks.map((c) => ({
      repository_id: repo.id,
      file_path: c.path,
      content: c.content,
      start_line: c.startLine,
      end_line: c.endLine,
      embedding: c.embedding,
    }));
    // Insert in batches to stay under payload limits
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from("repository_chunks").insert(batch);
      if (error) logger.error("db", `Failed to save chunks batch: ${error.message}`);
    }
  }

  // Replace analysis
  await supabase.from("analyses").delete().eq("repository_id", repo.id);
  const { error: analysisError } = await supabase.from("analyses").insert({
    repository_id: repo.id,
    payload: input.payload,
    master_prompt: input.masterPrompt,
  });
  if (analysisError) logger.error("db", `Failed to save analysis: ${analysisError.message}`);

  return repo;
}

export async function loadAnalysis(
  owner: string,
  name: string,
  branch?: string,
): Promise<LoadedAnalysis | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
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

  let query = supabase
    .from("repositories")
    .select("*")
    .eq("owner", owner)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1);
  if (branch) query = query.eq("branch", branch);

  const { data: repoRows, error } = await query;
  if (error) throw new Error(`Failed to load repository: ${error.message}`);
  const repoRow = repoRows?.[0];
  if (!repoRow) return null;
  const repo = mapRepository(repoRow);

  const { data: analysisRows } = await supabase
    .from("analyses")
    .select("*")
    .eq("repository_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const analysisRow = analysisRows?.[0];
  if (!analysisRow) return null;

  const { data: fileRows } = await supabase
    .from("repository_files")
    .select("path, language, size, content, importance_score")
    .eq("repository_id", repo.id);

  return {
    repository: repo,
    payload: analysisRow.payload as AnalysisPayload,
    masterPrompt: (analysisRow.master_prompt as string) ?? "",
    files: (fileRows ?? []).map((f) => ({
      path: f.path,
      language: f.language,
      size: f.size,
      content: f.content,
      importanceScore: f.importance_score,
    })),
  };
}

export async function getChunksWithEmbeddings(repositoryId: string): Promise<Array<RepositoryChunk & { embedding: number[] }>> {
  const supabase = getServerSupabase();
  if (!supabase) return memory.memoryGetChunks(repositoryId);

  const { data, error } = await supabase
    .from("repository_chunks")
    .select("id, file_path, content, start_line, end_line, embedding")
    .eq("repository_id", repositoryId);
  if (error) {
    logger.error("db", `Failed to load chunks: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    fileId: null,
    repositoryId,
    path: row.file_path,
    content: row.content,
    startLine: row.start_line,
    endLine: row.end_line,
    language: null,
    embedding: row.embedding,
  }));
}

export async function saveChatMessages(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const supabase = getServerSupabase();
  if (!supabase) {
    memory.memoryAppendMessages(messages);
    return;
  }
  const rows = messages.map((m) => ({
    session_key: m.sessionKey,
    role: m.role,
    content: m.content,
    references: m.references,
  }));
  const { error } = await supabase.from("chat_messages").insert(rows);
  if (error) logger.error("db", `Failed to save chat messages: ${error.message}`);
}

export async function loadChatMessages(sessionKey: string): Promise<ChatMessage[]> {
  const supabase = getServerSupabase();
  if (!supabase) return memory.memoryGetMessages(sessionKey);

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, session_key, role, content, references, created_at")
    .eq("session_key", sessionKey)
    .order("created_at", { ascending: true });
  if (error) {
    logger.error("db", `Failed to load chat messages: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    sessionKey: row.session_key,
    role: row.role,
    content: row.content,
    references: row.references ?? [],
    createdAt: row.created_at,
  }));
}

function mapRepository(row: Record<string, unknown>): RepositoryRecord {
  return {
    id: row.id as string,
    owner: row.owner as string,
    name: row.name as string,
    url: row.url as string,
    branch: row.branch as string,
    commitSha: row.commit_sha as string,
    createdAt: row.created_at as string,
  };
}

export { isDatabaseConfigured };
