import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  analysisStorageKey,
  buildChatFiles,
  loadAnalysisFromSessionStorage,
  saveAnalysisToSessionStorage,
  getAnalysisSnapshot,
  ANALYSIS_LOADING,
  type StoredAnalysis,
} from "@/lib/analysis-storage";
import type { AnalysisPayload, RepositoryRecord } from "@/types";

function repository(name = "repo"): RepositoryRecord {
  return {
    id: "id-1",
    owner: "owner",
    name,
    url: `https://github.com/owner/${name}`,
    branch: "main",
    commitSha: "abc123",
    createdAt: new Date().toISOString(),
  };
}

function payload(): AnalysisPayload {
  // Minimal shape matching AnalysisPayload's required fields.
  return {
    metadata: {
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      description: null,
      defaultBranch: "main",
      branch: "main",
      stars: 0,
      forks: 0,
      openIssues: 0,
      size: 0,
      language: null,
      topics: [],
      pushedAt: null,
      createdAt: null,
      isPrivate: false,
      isFork: false,
      htmlUrl: "https://github.com/owner/repo",
    },
    stats: {
      totalFiles: 0,
      analyzedFiles: 0,
      ignoredFiles: 0,
      totalLines: 0,
      estimatedTokens: 0,
      languages: [],
      fileTypes: [],
      sizeBytes: 0,
      largestFiles: [],
    },
    commitSha: "abc123",
    treeEntries: [],
    projectName: "repo",
    summary: "s",
    problem: "p",
    audience: "a",
    howItWorks: "h",
    techStack: [],
    dependencies: [],
    architecture: "",
    architectureDiagram: null,
    directoryExplanation: [],
    importantFiles: [],
    keyFlows: [],
    setupInstructions: "",
    environmentVariables: [],
    database: "",
    authentication: "",
    api: "",
    risks: [],
    suggestedLearningPath: [],
    learningPath: [],
  } as AnalysisPayload;
}

function stored(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return {
    repository: repository(),
    payload: payload(),
    masterPrompt: "prompt",
    ingestedPaths: ["index.ts"],
    chatFiles: [{ path: "index.ts", content: "console.log(1)" }],
    branch: "main",
    storedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Minimal sessionStorage stub (vitest runs in a node environment). */
function installSessionStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  // The module guards on `window` for SSR safety; stub it with the same storage.
  vi.stubGlobal("window", { sessionStorage: storage });
}

beforeEach(() => {
  installSessionStorage();
  vi.stubGlobal(
    "console",
    Object.assign({}, console, { log: vi.fn(), warn: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analysis-storage keys", () => {
  it("builds deterministic, repository-specific keys", () => {
    expect(analysisStorageKey("Owner", "Repo", "main")).toBe(
      "repotutor:analysis:owner/repo:main",
    );
    expect(analysisStorageKey("owner", "repo")).toBe(
      "repotutor:analysis:owner/repo:default",
    );
  });

  it("does not collide across repositories", () => {
    const a = analysisStorageKey("a", "x", "main");
    const b = analysisStorageKey("b", "y", "main");
    expect(a).not.toBe(b);
  });
});

describe("analysis-storage roundtrip", () => {
  it("saves and loads an analysis per repository", () => {
    saveAnalysisToSessionStorage(stored({ repository: repository("alpha") }));
    saveAnalysisToSessionStorage(stored({ repository: repository("beta") }));

    const alpha = loadAnalysisFromSessionStorage("owner", "alpha", "main");
    const beta = loadAnalysisFromSessionStorage("owner", "beta", "main");

    expect(alpha?.payload.projectName).toBe("repo");
    expect(beta?.payload.projectName).toBe("repo");
    expect(alpha).not.toBe(beta);
    expect(analysisStorageKey("owner", "alpha", "main")).not.toBe(
      analysisStorageKey("owner", "beta", "main"),
    );
  });

  it("returns null for unknown keys and invalid JSON", () => {
    expect(loadAnalysisFromSessionStorage("owner", "missing", "main")).toBeNull();
    sessionStorage.setItem(analysisStorageKey("owner", "bad", "main"), "{not json");
    expect(loadAnalysisFromSessionStorage("owner", "bad", "main")).toBeNull();
  });

  it("snapshot reader is stable and hydrates from storage", () => {
    const key = analysisStorageKey("owner", "snap", "main");
    // Before storing: null and stable across calls.
    expect(getAnalysisSnapshot("owner", "snap", "main")).toBeNull();
    expect(getAnalysisSnapshot("owner", "snap", "main")).toBeNull();
    // The server sentinel is distinct from any real snapshot.
    expect(ANALYSIS_LOADING).not.toBeNull();

    const value = stored({ repository: repository("snap") });
    sessionStorage.setItem(key, JSON.stringify(value));
    const first = getAnalysisSnapshot("owner", "snap", "main");
    const second = getAnalysisSnapshot("owner", "snap", "main");
    expect(first?.masterPrompt).toBe("prompt");
    expect(first).toBe(second); // memoized identity
  });
});

describe("buildChatFiles", () => {
  it("picks prioritized files within budget and file cap", () => {
    const files = [
      { path: "a.ts", content: "x".repeat(1000), importanceScore: 10 },
      { path: "readme.md", content: "y".repeat(1000), importanceScore: 90 },
      { path: "huge.ts", content: "z".repeat(500_000), importanceScore: 80 },
      { path: "b.ts", content: "w".repeat(1000), importanceScore: 50 },
    ];
    const picked = buildChatFiles(files, 3);
    expect(picked.map((f) => f.path)).toEqual(["readme.md", "b.ts", "a.ts"]);
    expect(picked.some((f) => f.path === "huge.ts")).toBe(false);
  });
});
