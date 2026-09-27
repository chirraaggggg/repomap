/**
 * File prioritization. Not all files are equally important.
 * Higher score = analyzed earlier and included in tighter budgets.
 */
import type { TreeEntry } from "@/types";

const EXACT_SCORES: Record<string, number> = {
  "readme.md": 100,
  "package.json": 90,
  "requirements.txt": 85,
  "pyproject.toml": 85,
  "cargo.toml": 85,
  "go.mod": 85,
  "gemfile": 80,
  "pom.xml": 80,
  "build.gradle": 80,
  "composer.json": 80,
  "dockerfile": 80,
  "docker-compose.yml": 80,
  "docker-compose.yaml": 80,
  ".env.example": 75,
  "tsconfig.json": 70,
  "next.config.js": 70,
  "next.config.mjs": 70,
  "next.config.ts": 70,
  "vite.config.ts": 70,
  "vite.config.js": 70,
  "nuxt.config.ts": 70,
  "astro.config.mjs": 70,
  "svelte.config.js": 70,
  "supabase/config.toml": 75,
  "makefile": 65,
  "justfile": 65,
  "license": 50,
  "contributing.md": 45,
  "architecture.md": 70,
};

const DIR_SCORES: Array<{ match: string; score: number }> = [
  { match: "prisma/", score: 85 },
  { match: "supabase/", score: 85 },
  { match: "migrations/", score: 80 },
  { match: "src/app/", score: 78 },
  { match: "app/", score: 75 },
  { match: "pages/", score: 75 },
  { match: "api/", score: 80 },
  { match: "server/", score: 78 },
  { match: "services/", score: 80 },
  { match: "lib/", score: 72 },
  { match: "middleware", score: 78 },
  { match: "auth", score: 76 },
  { match: "schema", score: 82 },
  { match: "components/", score: 40 },
  { match: "hooks/", score: 45 },
  { match: "contexts/", score: 45 },
  { match: "store/", score: 55 },
  { match: "workers/", score: 60 },
  { match: "scripts/", score: 45 },
  { match: "test", score: 20 },
  { match: "spec", score: 20 },
  { match: "stories", score: 15 },
  { match: "__tests__", score: 20 },
  { match: "__mocks__", score: 10 },
];

const FILENAME_HINTS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /(^|\/)(main|index|app|server|entry|_app|layout|route)\.[a-z]+$/i, score: 90 },
  { pattern: /(^|\/)middleware\.[a-z]+$/i, score: 78 },
  { pattern: /(^|\/)(schema|models?|entities?)\.[a-z]+$/i, score: 82 },
  { pattern: /(^|\/)(auth|session)[^/]*\.[a-z]+$/i, score: 76 },
  { pattern: /(^|\/)(db|database|supabase|prisma)[^/]*\.[a-z]+$/i, score: 80 },
  { pattern: /(provider|context)\.[a-z]+$/i, score: 50 },
  { pattern: /\.(test|spec)\.[a-z]+$/i, score: -60 },
  { pattern: /\.stories\.[a-z]+$/i, score: -70 },
  { pattern: /(generated|__generated__|\.gen\.[a-z]+$)/i, score: -100 },
];

/** Computes an importance score for a file. Pure function. */
export function prioritizeFile(entry: TreeEntry): number {
  const lower = entry.path.toLowerCase();

  let score = 30; // baseline

  const exact = EXACT_SCORES[lower] ?? EXACT_SCORES[`${lower.split("/").slice(0, 2).join("/")}/`];
  if (exact !== undefined) score = Math.max(score, exact);

  if (EXACT_SCORES[lower] !== undefined) return EXACT_SCORES[lower] as number;

  for (const { match, score: s } of DIR_SCORES) {
    if (lower.includes(match)) {
      score = Math.max(score, s);
      break;
    }
  }

  for (const { pattern, score: s } of FILENAME_HINTS) {
    if (pattern.test(lower)) {
      if (s < 0) return Math.min(score, 30 + s);
      score = Math.max(score, s);
      break;
    }
  }

  // Slight boost for root-level files
  if (!lower.includes("/")) score += 5;

  return score;
}

export interface RankedFile {
  entry: TreeEntry;
  score: number;
}

/** Ranks files by descending importance. */
export function rankFiles(entries: TreeEntry[]): RankedFile[] {
  return entries
    .map((entry) => ({ entry, score: prioritizeFile(entry) }))
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
}
