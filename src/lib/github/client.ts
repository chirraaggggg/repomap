/**
 * GitHub REST API client.
 * - Uses GITHUB_TOKEN automatically when present (5000 req/h vs 60 req/h).
 * - Handles rate limits, ETag conditional requests and timeouts.
 */
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const API_BASE = "https://api.github.com";
const TIMEOUT_MS = 30_000;

interface ApiErrorPayload {
  message?: string;
  documentation_url?: string;
}

function githubHeaders(etag?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "repomap-dev",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers["If-None-Match"] = etag;
  return headers;
}

async function githubFetch<T>(path: string, etag?: string): Promise<{ data: T; etag?: string; notModified: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: githubHeaders(etag),
      signal: controller.signal,
      // Route handlers must not cache GitHub payloads by default.
      cache: "no-store",
    });
    if (res.status === 304) return { data: undefined as T, etag, notModified: true };
    if (res.status === 404) throw new AppError("NOT_FOUND", "Repository could not be found.");
    if (res.status === 401) throw new AppError("PRIVATE_REPO", "This repository appears to be private.");
    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        const reset = res.headers.get("x-ratelimit-reset");
        const resetDate = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : "soon";
        throw new AppError("RATE_LIMIT", `GitHub API rate limit reached. Resets at ${resetDate}.`);
      }
      throw new AppError("PRIVATE_REPO", "This repository appears to be private or forbidden.");
    }
    if (res.status === 409) throw new AppError("NOT_FOUND", "Repository is empty.");
    if (!res.ok) {
      let detail = "";
      try {
        const payload = (await res.json()) as ApiErrorPayload;
        detail = payload.message ?? "";
      } catch {
        // ignore body parse errors
      }
      throw new AppError("INTERNAL", `GitHub API error (${res.status}). ${detail}`.trim());
    }
    const data = (await res.json()) as T;
    return { data, etag: res.headers.get("etag") ?? undefined, notModified: false };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new AppError("TIMEOUT", "GitHub request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface GitHubRepoPayload {
  full_name: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  language: string | null;
  topics?: string[];
  pushed_at: string | null;
  created_at: string | null;
  private: boolean;
  fork: boolean;
  html_url: string;
}

export async function getRepository(owner: string, repo: string): Promise<GitHubRepoPayload> {
  const { data } = await githubFetch<GitHubRepoPayload>(`/repos/${owner}/${repo}`);
  return data;
}

export interface GitTreePayload {
  sha: string;
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    size?: number;
    sha: string;
  }>;
  truncated: boolean;
}

/**
 * Fetches the full recursive tree for a branch/commit.
 * A single request returns every file path — no per-file listing.
 */
export async function getRepositoryTree(owner: string, repo: string, ref: string): Promise<GitTreePayload> {
  const { data } = await githubFetch<GitTreePayload>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  return data;
}

export interface CommitPayload {
  sha: string;
  commit: { message: string };
}

export async function getBranchCommit(owner: string, repo: string, ref: string): Promise<CommitPayload> {
  const { data } = await githubFetch<CommitPayload>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  return data;
}

/**
 * Fetches raw file content via Contents API (base64) or raw media type.
 * Files up to 1 MB are supported through the blob endpoint fallback.
 */
export async function getFileContent(owner: string, repo: string, branch: string, path: string): Promise<string> {
  const raw = await fetchRaw(owner, repo, branch, path);
  if (raw !== null) return raw;
  // Fallback: blob API for files >1 MB via raw endpoint restrictions.
  const contents = await githubFetch<{ content?: string; encoding?: string }>(
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
  );
  if (contents.data.encoding === "base64" && contents.data.content) {
    return Buffer.from(contents.data.content, "base64").toString("utf-8");
  }
  throw new AppError("INTERNAL", `Unable to read file ${path}`);
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (res.ok) return await res.text();
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches many files with bounded concurrency. */
export async function getMultipleFileContents(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Map<string, string>> {
  const concurrency = options.concurrency ?? 8;
  const results = new Map<string, string>();
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (index < paths.length) {
      const current = paths[index++];
      if (options.signal?.aborted) return;
      try {
        const content = await getFileContent(owner, repo, branch, current);
        if (content !== null && content !== undefined) results.set(current, content);
      } catch (err) {
        logger.warn("github.files", `Failed to fetch ${current}`, err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);
  return results;
}
