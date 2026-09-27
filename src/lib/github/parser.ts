/**
 * GitHub repository URL parsing and validation.
 * Pure functions — no network access.
 */
import type { ParsedRepo } from "@/types";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * Parses a GitHub repository URL or owner/repo shorthand.
 * Accepts:
 *   https://github.com/user/repo
 *   github.com/user/repo/
 *   https://www.github.com/user/repo/tree/main
 *   https://github.com/user/repo/tree/master/sub/dir
 *   user/repo
 * Rejects everything else (hosts, gists, pull requests, issues, etc.).
 */
export function parseGitHubUrl(input: string): ParsedRepo | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    // `user/repo` shorthand: a single `/` with no dot means owner/repo, not host/path.
    const isShorthand = !raw.includes("://") && !raw.includes(".") && raw.includes("/");
    const normalized = raw.startsWith("http") ? raw : `https://${isShorthand ? "github.com/" : ""}${raw}`;
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => s)
    .filter((s) => s !== "#");

  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  if (!isValidOwnerOrRepo(owner) || !isValidOwnerOrRepo(repo)) return null;

  const reserved = new Set([
    "pulls", "issues", "pull", "blob", "commits", "commit", "actions",
    "releases", "tags", "projects", "wiki", "settings", "network", "milestones",
    "graphs", "notifications", "search", "orgs", "organizations", "marketplace",
    "sponsors", "stargazers", "watchers", "forks", "activity", "security",
  ]);
  if (segments.length >= 3 && reserved.has(segments[2])) return null;

  // Optional branch/path: /tree/<branch>(/path...)
  if (segments.length >= 3 && segments[2] === "tree") {
    const branch = segments[3];
    if (!branch) return null;
    const path = segments.slice(4).join("/") || undefined;
    return { owner, repo, branch: decodeURIComponent(branch), path: path ? decodeURIComponent(path) : undefined };
  }

  return { owner, repo };
}

function isValidOwnerOrRepo(value: string): boolean {
  if (value.length === 0 || value.length > 100) return false;
  if (value === "." || value === "..") return false;
  // GitHub rules: alphanumeric and hyphens/underscores/dots, cannot start with dot or hyphen
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/** True when the parsed repository is publicly reachable via the GitHub API. */
export async function assertPublicRepo(owner: string, repo: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) {
    throw new Error("Repository could not be found.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("This repository appears to be private or rate limited.");
  }
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}).`);
  }
}
