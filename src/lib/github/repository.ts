/**
 * Repository-level GitHub operations.
 */
import {
  getRepository,
  getBranchCommit,
  type GitHubRepoPayload,
} from "./client";
import type { RepositoryMetadata } from "@/types";

export async function fetchRepositoryMetadata(owner: string, repo: string, requestedBranch?: string): Promise<{ metadata: RepositoryMetadata; commitSha: string }> {
  const payload: GitHubRepoPayload = await getRepository(owner, repo);
  const branch = requestedBranch || payload.default_branch;
  const commit = await getBranchCommit(owner, repo, branch);
  const metadata: RepositoryMetadata = {
    owner: payload.full_name.split("/")[0] ?? owner,
    name: payload.full_name.split("/")[1] ?? repo,
    fullName: payload.full_name,
    description: payload.description,
    defaultBranch: payload.default_branch,
    branch,
    stars: payload.stargazers_count,
    forks: payload.forks_count,
    openIssues: payload.open_issues_count,
    size: payload.size * 1024, // GitHub reports KB
    language: payload.language,
    topics: payload.topics ?? [],
    pushedAt: payload.pushed_at,
    createdAt: payload.created_at,
    isPrivate: payload.private,
    isFork: payload.fork,
    htmlUrl: payload.html_url,
  };
  return { metadata, commitSha: commit.sha };
}

export function githubTreeUrl(metadata: RepositoryMetadata, path?: string): string {
  const base = `${metadata.htmlUrl}/blob/${metadata.branch}`;
  return path ? `${base}/${path}` : base;
}
