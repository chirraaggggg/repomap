/**
 * File filtering for ingestion. Never ingest unnecessary files.
 */
import type { TreeEntry } from "@/types";

export interface FilterLimits {
  maxFileSize: number;   // bytes
  maxTotalSize: number;  // bytes
  maxFiles: number;
}

export const DEFAULT_LIMITS: FilterLimits = {
  maxFileSize: 200 * 1024,        // 200 KB per file
  maxTotalSize: 3 * 1024 * 1024,  // 3 MB total ingested content
  maxFiles: 300,                  // max files fetched for analysis
};

const IGNORED_DIRS = new Set([
  ".git", ".github/workflows", "node_modules", ".next", "dist", "build",
  "coverage", ".cache", "target", "vendor", "venv", ".venv", "__pycache__",
  ".turbo", ".output", ".vercel", "out", "storybook-static", ".pnpm-store",
]);

const IGNORED_FILES = new Set([
  ".env", ".env.local", ".env.development", ".env.production", ".DS_Store",
  ".gitignore", ".gitattributes", ".editorconfig", ".prettierrc", ".eslintrc",
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock",
  "Gemfile.lock", "poetry.lock", "Pipfile.lock", "composer.lock", "Cargo.lock",
  ".nvmrc", ".npmrc", ".yarnrc", ".babelrc", ".mocharc", ".nycrc",
  "CODEOWNERS", "FUNDING.yml", ".prettierignore", ".eslintignore",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".avif",
  ".pdf", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
  ".mp4", ".mov", ".avi", ".mkv", ".mp3", ".wav", ".ogg", ".flac",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".exe", ".dmg", ".msi", ".deb", ".rpm", ".app", ".apk", ".jar", ".war",
  ".so", ".dylib", ".dll", ".bin", ".o", ".a", ".obj", ".wasm",
  ".sqlite", ".db", ".parquet", ".pkl", ".pickle", ".pyc", ".pyo", ".class",
  ".onnx", ".pb", ".h5", ".ckpt", ".pt", ".pth", ".safetensors", ".gguf",
  ".psd", ".ai", ".sketch", ".fig", ".blend",
]);

const MINIFIED_PATTERNS = [/\.min\.(js|css)$/i, /\.map$/i, /\.d\.ts$/i, /-lock\./i, /\.snap$/i];

export interface IgnoreReasons {
  tooLarge: string;
  binary: string;
  minified: string;
  ignoredDir: string;
  ignoredFile: string;
  generated: string;
}

export const IGNORE_REASONS: IgnoreReasons = {
  tooLarge: "File exceeds size limit",
  binary: "Binary file",
  minified: "Minified or generated artifact",
  ignoredDir: "Ignored directory",
  ignoredFile: "Ignored file",
  generated: "Generated file",
};

function isDotEnv(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return base === ".env" || base.startsWith(".env.");
}

/** Decides whether a tree entry should be ingested. Pure function. */
export function shouldInclude(entry: TreeEntry, limits: FilterLimits = DEFAULT_LIMITS): { include: boolean; reason?: string } {
  const parts = entry.path.split("/");
  const base = parts[parts.length - 1] ?? entry.path;

  for (let i = 0; i < parts.length - 1; i++) {
    if (IGNORED_DIRS.has(parts[i] as string)) {
      return { include: false, reason: IGNORE_REASONS.ignoredDir };
    }
  }
  // .github/workflows
  if (parts.length >= 2 && parts[0] === ".github" && parts[1] === "workflows") {
    return { include: false, reason: IGNORE_REASONS.ignoredDir };
  }

  if (IGNORED_FILES.has(base) || isDotEnv(entry.path)) {
    return { include: false, reason: IGNORE_REASONS.ignoredFile };
  }

  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  if (BINARY_EXTENSIONS.has(ext)) return { include: false, reason: IGNORE_REASONS.binary };

  if (MINIFIED_PATTERNS.some((re) => re.test(base))) {
    return { include: false, reason: IGNORE_REASONS.minified };
  }

  if ((entry.size ?? 0) > limits.maxFileSize) {
    return { include: false, reason: IGNORE_REASONS.tooLarge };
  }

  return { include: true };
}

/** Filters a full tree into included/ignored buckets, honoring maxFiles. */
export function filterTree(entries: TreeEntry[], limits: FilterLimits = DEFAULT_LIMITS): FileFilterOutcome {
  const included: TreeEntry[] = [];
  const ignored: Array<{ path: string; reason: string }> = [];
  let totalSize = 0;

  for (const entry of entries) {
    const verdict = shouldInclude(entry, limits);
    if (!verdict.include) {
      ignored.push({ path: entry.path, reason: verdict.reason ?? "Ignored" });
      continue;
    }
    if (included.length >= limits.maxFiles) {
      ignored.push({ path: entry.path, reason: "File limit reached" });
      continue;
    }
    const size = entry.size ?? 0;
    if (totalSize + size > limits.maxTotalSize) {
      ignored.push({ path: entry.path, reason: "Total size budget reached" });
      continue;
    }
    totalSize += size;
    included.push(entry);
  }

  return { included, ignored };
}

export interface FileFilterOutcome {
  included: TreeEntry[];
  ignored: Array<{ path: string; reason: string }>;
}
