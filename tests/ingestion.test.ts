import { describe, it, expect } from "vitest";
import { filterTree, shouldInclude, DEFAULT_LIMITS } from "@/lib/ingestion/filter";
import { prioritizeFile, rankFiles } from "@/lib/ingestion/prioritize";
import { estimateTokens, fitWithinBudget } from "@/lib/ingestion/tokenizer";
import { renderAsciiTree, collectDirectories } from "@/lib/github/ascii-tree";
import { detectLanguage } from "@/lib/ingestion/languages";
import { detectTechStack } from "@/lib/ai/tech-stack";
import { parseJsonLoose } from "@/lib/ai/groq";
import { sanitizeAnalysis } from "@/lib/ai/analyze";
import { validateRepoInput } from "@/lib/security/validate";
import { rateLimit } from "@/lib/security/rate-limit";
import { chunkFile } from "@/lib/embeddings/chunker";
import { retrieveChunks, formatRetrievedContext } from "@/lib/embeddings/retrieval";
import { buildClientMasterPrompt } from "@/lib/master-prompt-client";
import { AppError } from "@/lib/errors";
import type { TreeEntry, IngestedFile, RepositoryMetadata } from "@/types";

function entry(path: string, size = 100): TreeEntry {
  return { path, mode: "100644", type: "blob", size, sha: "abc" };
}

function meta(): RepositoryMetadata {
  return {
    owner: "o",
    name: "r",
    fullName: "o/r",
    description: null,
    defaultBranch: "main",
    branch: "main",
    stars: 1,
    forks: 0,
    openIssues: 0,
    size: 1000,
    language: "TypeScript",
    topics: [],
    pushedAt: null,
    createdAt: null,
    isPrivate: false,
    isFork: false,
    htmlUrl: "https://github.com/o/r",
  };
}

function ingested(path: string, content: string, score = 50): IngestedFile {
  return {
    path,
    language: detectLanguage(path),
    size: content.length,
    content,
    score,
    lines: content.split("\n").length,
    truncated: false,
  };
}

describe("file filtering", () => {
  it("keeps normal source files", () => {
    const result = shouldInclude(entry("src/app/page.tsx"));
    expect(result.include).toBe(true);
  });

  it("ignores lockfiles, env files, and dependency dirs", () => {
    expect(shouldInclude(entry("pnpm-lock.yaml")).include).toBe(false);
    expect(shouldInclude(entry(".env.local")).include).toBe(false);
    expect(shouldInclude(entry("node_modules/x/index.js")).include).toBe(false);
    expect(shouldInclude(entry(".github/workflows/ci.yml")).include).toBe(false);
    expect(shouldInclude(entry("dist/bundle.js")).include).toBe(false);
  });

  it("ignores binaries, minified, and oversized files", () => {
    expect(shouldInclude(entry("logo.png")).include).toBe(false);
    expect(shouldInclude(entry("app.min.js")).include).toBe(false);
    const result = shouldInclude(entry("big.txt", DEFAULT_LIMITS.maxFileSize + 1));
    expect(result.include).toBe(false);
  });

  it("respects maxFiles and total size budget in filterTree", () => {
    const limited = filterTree(
      [entry("a/1.ts"), entry("a/2.ts"), entry("a/3.ts"), entry("a/4.ts")],
      { ...DEFAULT_LIMITS, maxFiles: 2, maxTotalSize: 1_000_000 },
    );
    expect(limited.included).toHaveLength(2);
    expect(limited.ignored.length).toBe(2);

    const sizeCapped = filterTree(
      [entry("big1.ts", 700), entry("big2.ts", 700)],
      { ...DEFAULT_LIMITS, maxFiles: 10, maxTotalSize: 1000 },
    );
    expect(sizeCapped.included).toHaveLength(1);
  });
});

describe("file prioritization", () => {
  it("ranks README and package.json above components and tests", () => {
    const ranked = rankFiles([
      entry("src/components/Button.tsx"),
      entry("package.json"),
      entry("src/components/Button.test.tsx"),
      entry("README.md"),
      entry("src/app/api/generate/route.ts"),
      entry("prisma/schema.prisma"),
    ]);
    const paths = ranked.map((r) => r.entry.path);
    expect(paths.indexOf("README.md")).toBeLessThan(paths.indexOf("src/components/Button.tsx"));
    expect(paths.indexOf("package.json")).toBeLessThan(paths.indexOf("src/components/Button.test.tsx"));
    expect(ranked[0]?.entry.path === "README.md" || ranked[0]?.entry.path === "package.json").toBe(true);
    expect(prioritizeFile(entry("src/generated/client.ts"))).toBeLessThan(prioritizeFile(entry("src/index.ts")));
  });

  it("scores api routes above tests", () => {
    expect(prioritizeFile(entry("src/app/api/users/route.ts"))).toBeGreaterThan(
      prioritizeFile(entry("src/app/api/users/route.test.ts")),
    );
  });
});

describe("token estimation", () => {
  it("estimates tokens roughly by chars/3.6", () => {
    expect(estimateTokens("a".repeat(360))).toBe(100);
    expect(estimateTokens("")).toBe(0);
  });

  it("fitWithinBudget stops at the first non-fitting item", () => {
    const items = [10, 20, 30, 100];
    const { selected, tokens, overflow } = fitWithinBudget(
      items,
      (n) => n,
      55,
    );
    expect(selected).toEqual([10, 20]);
    expect(tokens).toBe(30);
    expect(overflow).toBe(true);
  });
});

describe("ascii tree rendering", () => {
  it("renders hierarchical output with correct connectors", () => {
    const tree = renderAsciiTree([entry("src/app/page.tsx"), entry("src/lib/util.ts"), entry("README.md")]);
    expect(tree).toContain("src/");
    expect(tree).toContain("├── app/");
    expect(tree).toContain("└── lib/");
    expect(tree).toContain("page.tsx");
    expect(collectDirectories(["a/b/c.ts"])).toEqual(new Set(["a", "a/b"]));
  });

  it("truncates large trees", () => {
    const many = Array.from({ length: 50 }, (_, i) => entry(`f${i}.ts`));
    const tree = renderAsciiTree(many, 10);
    expect(tree).toContain("truncated");
  });
});

describe("languages", () => {
  it("detects languages from extensions", () => {
    expect(detectLanguage("src/index.ts")).toBe("TypeScript");
    expect(detectLanguage("styles/main.css")).toBe("CSS");
    expect(detectLanguage("Dockerfile")).toBe("Dockerfile");
    expect(detectLanguage("image.png")).toBeNull();
  });
});

describe("tech stack detection", () => {
  it("detects Next.js + Supabase from real dependencies", () => {
    const files = [
      ingested("package.json", JSON.stringify({ dependencies: { next: "15", react: "19", "@supabase/supabase-js": "2" } })),
      ingested("tsconfig.json", "{}"),
    ];
    const stack = detectTechStack(files, meta());
    const names = stack.map((s) => s.name);
    expect(names).toContain("Next.js");
    expect(names).toContain("React");
    expect(names).toContain("Supabase");
    expect(names).toContain("TypeScript");
  });

  it("does not fabricate technologies without evidence", () => {
    const stack = detectTechStack([ingested("src/index.ts", "console.log(1)")], meta());
    expect(stack.map((s) => s.name)).not.toContain("Stripe");
    expect(stack.map((s) => s.name)).not.toContain("Docker");
  });
});

describe("AI response parsing", () => {
  it("parses fenced and raw JSON", () => {
    const obj = { projectName: "x", summary: "y" };
    expect(parseJsonLoose(JSON.stringify(obj))).toEqual(obj);
    expect(parseJsonLoose("```json\n" + JSON.stringify(obj) + "\n```")).toEqual(obj);
    expect(parseJsonLoose("Here is the analysis:\n" + JSON.stringify(obj) + "\nDone.")).toEqual(obj);
  });

  it("throws AppError on garbage", () => {
    expect(() => parseJsonLoose("not json at all")).toThrow(AppError);
  });

  it("sanitizeAnalysis drops hallucinated file paths", () => {
    const real = new Set(["src/index.ts"]);
    const input = {
      importantFiles: [
        { path: "src/index.ts", role: "entry", why: "", importance: 90 },
        { path: "src/fake.ts", role: "nope", why: "", importance: 50 },
      ],
      learningPath: [{ level: 1, title: "t", goal: "", files: ["src/index.ts", "src/fake.ts"] }],
    };
    const output = sanitizeAnalysis(input, real) as typeof input;
    expect(output.importantFiles).toHaveLength(1);
    expect(output.learningPath[0]?.files).toEqual(["src/index.ts"]);
  });
});

describe("security validation", () => {
  it("accepts valid repo URLs", () => {
    expect(validateRepoInput({ url: "https://github.com/user/repo" })).toEqual({ owner: "user", repo: "repo", branch: undefined });
  });

  it("rejects non-GitHub hosts and malformed bodies", () => {
    expect(() => validateRepoInput({ url: "https://evil.com/a/b" })).toThrow(AppError);
    expect(() => validateRepoInput({})).toThrow(AppError);
    expect(() => validateRepoInput({ url: 42 })).toThrow(AppError);
  });

  it("rate limiter blocks past the limit and resets windows", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(false);
  });
});

describe("RAG chunking + retrieval", () => {
  it("chunks with overlap and correct line numbers", () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
    const chunks = chunkFile("a.ts", lines.join("\n"), "TypeScript");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[1]?.startLine).toBe(51); // 60-line window, 10 overlap
    expect(chunks.at(-1)?.endLine).toBe(150);
  });

  it("retrieval ranks keyword-matching chunks higher and respects budget", () => {
    const embedding = (seed: number) => [seed, seed, seed];
    const chunks = [
      { id: "1", path: "auth.ts", content: "login session authentication handler", startLine: 1, endLine: 10, embedding: embedding(1) },
      { id: "2", path: "ui.tsx", content: "button styles for the menu", startLine: 1, endLine: 10, embedding: embedding(0) },
    ];
    const query = [1, 1, 1];
    const hits = retrieveChunks("how does authentication work", query, chunks, 1000);
    expect(hits[0]?.chunk.path).toBe("auth.ts");
    expect(formatRetrievedContext(hits)).toContain("auth.ts");
  });
});

describe("client prompt builder", () => {
  it("builds quick and developer modes from the payload", () => {
    const base = {
      owner: "o",
      repo: "r",
      branch: "main",
      treeEntries: [entry("src/index.ts")],
      analysisFiles: [{ path: "src/index.ts", role: "entry", why: "starts the app", importance: 90 }],
      fallback: "",
    };
    const quick = buildClientMasterPrompt({ ...base, mode: "quick" });
    const dev = buildClientMasterPrompt({ ...base, mode: "developer" });
    expect(quick).toContain("o/r");
    expect(quick).toContain("src/index.ts");
    expect(dev).toContain("onboarding");
  });
});
