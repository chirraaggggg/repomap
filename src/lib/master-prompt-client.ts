/**
 * Client-side master prompt assembly for modes not persisted server-side.
 * Lightweight variant of lib/ai/master-prompt.ts that works from the
 * analysis payload without source code.
 */
import type { ImportantFile, TreeEntry } from "@/types";

export type PromptMode = "quick" | "detailed" | "developer";

export interface ClientPromptInput {
  mode: PromptMode;
  owner: string;
  repo: string;
  branch: string;
  treeEntries: TreeEntry[];
  analysisFiles: ImportantFile[];
  summary?: string;
  architecture?: string;
  setup?: string;
  fallback: string;
}

export function buildClientMasterPrompt(input: ClientPromptInput): string {
  const { mode, owner, repo, branch, treeEntries, analysisFiles } = input;

  const lines: string[] = [];

  if (mode === "quick") {
    lines.push(
      "You are an expert software engineer helping me understand this repository. Be concise.",
      "",
      "Repository:",
      `${owner}/${repo} (https://github.com/${owner}/${repo}, branch ${branch})`,
      "",
      "Directory structure:",
      renderTree(treeEntries, 60),
      "",
      "Important files:",
      analysisFiles.slice(0, 8).map((f) => `- ${f.path} — ${f.role}`).join("\n") || "Not determined",
      "",
      "Rules:",
      "1. Use the provided repository context.",
      "2. Reference actual file paths.",
      "3. Never invent functionality.",
      "4. If information is missing, say so.",
    );
    return lines.join("\n");
  }

  if (mode === "developer") {
    lines.push(
      "You are a senior engineer onboarding me as a new contributor to this repository.",
      "",
      "Repository:",
      `${owner}/${repo} (https://github.com/${owner}/${repo}, branch ${branch})`,
      "",
      "Directory structure:",
      renderTree(treeEntries, 150),
      "",
      "Important files (with roles):",
      analysisFiles.map((f) => `- ${f.path} — ${f.role}${f.why ? `: ${f.why}` : ""}`).join("\n") || "Not determined",
      "",
      input.architecture ? `Architecture:\n${input.architecture}\n` : "",
      input.setup ? `Setup:\n${input.setup}\n` : "",
      "Your job is to help me modify this codebase confidently.",
      "Rules:",
      "1. Ground every answer in the repository structure described above.",
      "2. Reference actual file paths.",
      "3. Never invent APIs, props, or database columns.",
      "4. When proposing changes, list exact files to touch and the order of operations.",
      "5. If information is missing, say so explicitly.",
    );
    return lines.filter((l) => l !== "").join("\n");
  }

  // detailed fallback: use persisted master prompt when available
  return input.fallback;
}

function renderTree(entries: TreeEntry[], maxEntries: number): string {
  const files = entries.map((e) => e.path).sort();
  const lines: string[] = [];
  interface Node {
    dirs: Map<string, Node>;
    files: string[];
  }
  const root: Node = { dirs: new Map(), files: [] };
  for (const p of files) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i] as string;
      let child = node.dirs.get(seg);
      if (!child) {
        child = { dirs: new Map(), files: [] };
        node.dirs.set(seg, child);
      }
      node = child;
    }
    node.files.push(parts[parts.length - 1] as string);
  }
  let count = 0;
  const walk = (node: Node, prefix: string, name: string, isRoot: boolean) => {
    if (count >= maxEntries) return;
    if (!isRoot) {
      lines.push(`${prefix}${name}/`);
      count++;
    }
    const dirEntries = [...node.dirs.entries()];
    const total = dirEntries.length + node.files.length;
    let index = 0;
    for (const [dirName, child] of dirEntries) {
      walk(child, `${prefix}${index === total - 1 ? "    " : "│   "}`, dirName, false);
      index++;
    }
    for (const file of node.files) {
      if (count >= maxEntries) {
        lines.push("… (truncated)");
        return;
      }
      lines.push(`${prefix}${index === total - 1 ? "└── " : "├── "}${file}`);
      count++;
      index++;
    }
  };
  walk(root, "", "", true);
  return lines.join("\n");
}
