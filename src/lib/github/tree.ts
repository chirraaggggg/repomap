/**
 * Repository tree retrieval and rendering.
 */
import { getRepositoryTree, type GitTreePayload } from "./client";
import type { TreeEntry } from "@/types";

export async function fetchRepositoryTree(owner: string, repo: string, ref: string): Promise<{ entries: TreeEntry[]; truncated: boolean; sha: string }> {
  const payload: GitTreePayload = await getRepositoryTree(owner, repo, ref);
  const entries: TreeEntry[] = [];
  for (const node of payload.tree) {
    if (node.type === "blob") {
      entries.push({ path: node.path, mode: node.mode, type: "blob", size: node.size ?? 0, sha: node.sha });
    }
    // directories are derivable from blob paths; commit entries (submodules) are skipped
  }
  return { entries, truncated: payload.truncated, sha: payload.sha };
}
