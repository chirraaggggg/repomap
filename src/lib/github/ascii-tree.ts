/**
 * Converts a flat file path list into an ASCII tree string, e.g.
 *
 * src/
 * ├── app/
 * │   └── page.tsx
 * └── lib/
 */
import type { TreeEntry } from "@/types";

interface DirNode {
  dirs: Map<string, DirNode>;
  files: string[];
}

function buildHierarchy(paths: string[]): DirNode {
  const root: DirNode = { dirs: new Map(), files: [] };
  for (const filePath of paths) {
    const parts = filePath.split("/");
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
  return root;
}

function walk(
  node: DirNode,
  prefix: string,
  isRoot: boolean,
  maxEntries: number,
  state: { count: number; truncated: boolean },
  lines: string[],
): void {
  const dirEntries = [...node.dirs.entries()];
  const files = node.files;
  const total = dirEntries.length + files.length;
  let index = 0;

  const connector = (last: boolean) => (isRoot ? "" : last ? "└── " : "├── ");
  const childPrefix = (last: boolean) => `${prefix}${isRoot ? "" : last ? "    " : "│   "}`;

  for (const pair of dirEntries) {
    const dirName = pair[0];
    const child = pair[1];
    const last = index === total - 1;
    if (state.count >= maxEntries) {
      state.truncated = true;
      return;
    }
    lines.push(`${prefix}${connector(last)}${dirName}/`);
    state.count++;
    walk(child, childPrefix(last), false, maxEntries, state, lines);
    index++;
  }

  for (const file of files) {
    const last = index === total - 1;
    if (state.count >= maxEntries) {
      state.truncated = true;
      return;
    }
    lines.push(`${prefix}${connector(last)}${file}`);
    state.count++;
    index++;
  }
}

export function renderAsciiTree(entries: TreeEntry[], maxEntries = 2000): string {
  const paths = entries.map((e) => e.path).sort();
  const root = buildHierarchy(paths);
  const lines: string[] = [];
  const state = { count: 0, truncated: false };
  walk(root, "", true, maxEntries, state, lines);
  if (state.truncated) lines.push("… (truncated)");
  return lines.join("\n");
}

/** Builds the set of parent directory paths for a list of files. */
export function collectDirectories(paths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs;
}
