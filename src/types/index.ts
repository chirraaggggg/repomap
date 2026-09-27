import type { z } from "zod";
import { AnalysisResultSchema } from "@/lib/ai/analysis-schema";

/** Structured AI analysis of a repository. */
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Persisted analysis payload: AI analysis plus ingestion metadata. */
export interface AnalysisPayload {
  metadata: RepositoryMetadata;
  stats: RepoStats;
  commitSha: string;
  /** Full file tree (paths + sizes) for the Files tab. */
  treeEntries: TreeEntry[];
  projectName: string;
  summary: string;
  problem: string;
  audience: string;
  howItWorks: string;
  techStack: TechStackItem[];
  dependencies: DependencyItem[];
  architecture: string;
  architectureDiagram: ArchitectureDiagram | null;
  directoryExplanation: DirectoryItem[];
  importantFiles: ImportantFile[];
  keyFlows: KeyFlow[];
  setupInstructions: string;
  environmentVariables: EnvVarItem[];
  database: string;
  authentication: string;
  api: string;
  risks: string[];
  suggestedLearningPath: string[];
  learningPath: LearningLevel[];
}

/** A parsed GitHub repository reference. */
export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export interface RepositoryMetadata {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  branch: string;
  stars: number;
  forks: number;
  openIssues: number;
  size: number;
  language: string | null;
  topics: string[];
  pushedAt: string | null;
  createdAt: string | null;
  isPrivate: boolean;
  isFork: boolean;
  htmlUrl: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

export interface RepositoryTree {
  branch: string;
  truncated: boolean;
  entries: TreeEntry[];
}

export interface FileFilterResult {
  included: TreeEntry[];
  ignored: Array<{ path: string; reason: string }>;
}

export interface ScoredFile {
  entry: TreeEntry;
  score: number;
  language: string | null;
}

export interface IngestedFile {
  path: string;
  language: string | null;
  size: number;
  content: string;
  score: number;
  lines: number;
  truncated: boolean;
}

export interface RepoStats {
  totalFiles: number;
  analyzedFiles: number;
  ignoredFiles: number;
  totalLines: number;
  estimatedTokens: number;
  languages: LanguageShare[];
  fileTypes: Array<{ ext: string; count: number }>;
  sizeBytes: number;
  largestFiles: Array<{ path: string; size: number }>;
}

export interface LanguageShare {
  name: string;
  percentage: number;
}

export interface TechStackItem {
  name: string;
  category: string;
  evidence: string;
}

export interface ArchitectureDiagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramNode {
  id: string;
  label: string;
  layer: "client" | "frontend" | "backend" | "data" | "external";
  /** Strict JSON schema models optionality as nullable. */
  detail?: string | null;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string | null;
}

export interface DirectoryItem {
  path: string;
  purpose: string;
}

export interface ImportantFile {
  path: string;
  role: string;
  why: string;
  importance: number;
}

export interface KeyFlow {
  name: string;
  description: string;
  steps: string[];
}

export interface EnvVarItem {
  name: string;
  purpose: string;
}

export interface DependencyItem {
  name: string;
  version: string;
  type: "runtime" | "development";
}

export interface LearningLevel {
  level: number;
  title: string;
  goal: string;
  files: string[];
}

export interface RepositoryChunk {
  id: string;
  fileId: string | null;
  repositoryId: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string | null;
  score?: number;
}

export interface ChatMessage {
  id: string;
  sessionKey: string;
  role: "user" | "assistant";
  content: string;
  references: FileReference[];
  createdAt: string;
}

export interface FileReference {
  path: string;
  snippet?: string;
  line?: number;
}

export interface ChatSessionSummary {
  sessionKey: string;
  repositoryId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

export interface IngestionResult {
  metadata: RepositoryMetadata;
  commitSha: string;
  tree: RepositoryTree;
  included: ScoredFile[];
  ignored: Array<{ path: string; reason: string }>;
  stats: RepoStats;
  techStack: TechStackItem[];
  ingestedFiles: IngestedFile[];
  context: string;
  contextTokens: number;
  truncated: boolean;
}

export interface RepositoryRecord {
  id: string;
  owner: string;
  name: string;
  url: string;
  branch: string;
  commitSha: string;
  createdAt: string;
}

export interface AnalysisRecord {
  id: string;
  repositoryId: string;
  payload: AnalysisPayload;
  masterPrompt: string;
  createdAt: string;
}
