"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File as FileIcon, Folder, FolderOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import { fetchFileContent, explainFile } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AnalysisPayload, TreeEntry } from "@/types";

interface Props {
  owner: string;
  repo: string;
  branch: string;
  payload: AnalysisPayload;
  ingestedPaths: string[];
}

interface FilePayload {
  path: string;
  language: string | null;
  content: string;
  lines: number;
  ingested: boolean;
  importance?: number;
}

interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children: TreeNode[];
  entry?: TreeEntry;
}

function buildTree(entries: TreeEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i] as string;
      let child = node.children.find((c) => c.type === "dir" && c.name === seg);
      if (!child) {
        child = { name: seg, path: parts.slice(0, i + 1).join("/"), type: "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    }
    const fileName = parts[parts.length - 1] ?? entry.path;
    node.children.push({ name: fileName, path: entry.path, type: "file", children: [], entry });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  expanded,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  toggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  if (node.type === "dir") {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-[var(--surface-2)]"
          style={{ paddingLeft: depth * 12 + 8 }}
          aria-expanded={isOpen}
        >
          {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-muted)]" /> : <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />}
          {isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />}
          <span className="truncate">{node.name}/</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <TreeRow key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} />
            ))
          : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-[var(--surface-2)]",
        selected === node.path && "bg-accent-soft text-accent",
      )}
      style={{ paddingLeft: depth * 12 + 8 + 16 }}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      <span className="truncate font-mono">{node.name}</span>
    </button>
  );
}

function FileViewer({ owner, repo, branch, path }: { owner: string; repo: string; branch: string; path: string }) {
  const [state, setState] = useState<{ path: string; data: FilePayload | null; error: string | null }>({
    path: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchFileContent(owner, repo, path, branch)
      .then((res) => {
        if (!cancelled) setState({ path, data: res, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ path, data: null, error: err instanceof Error ? err.message : "Failed to load file" });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, path, branch]);

  // Derived: while the latest fetch for this path has not landed, we are loading.
  const loading = state.path !== path;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading file…
      </div>
    );
  }
  if (state.error) {
    return <p className="py-8 text-center text-sm text-[var(--danger)]">{state.error}</p>;
  }
  if (!state.data) return null;

  return <CodeBlock code={state.data.content} language={state.data.language} />;
}

export function FilesTab({ owner, repo, branch, payload, ingestedPaths }: Props) {
  const entries = useMemo<TreeEntry[]>(() => payload.treeEntries ?? [], [payload.treeEntries]);
  const tree = useMemo(() => buildTree(entries), [entries]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const important = payload.importantFiles[0]?.path;
    if (important) {
      const parts = important.split("/");
      for (let i = 1; i < parts.length; i++) initial.add(parts.slice(0, i).join("/"));
    }
    if (initial.size === 0) initial.add("src");
    return initial;
  });

  const [selected, setSelected] = useState<string | null>(payload.importantFiles[0]?.path ?? null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const select = useCallback((path: string) => {
    setSelected(path);
    setExplanation(null);
    setExplaining(false);
  }, []);

  const runExplain = async (action: "explain" | "references") => {
    if (!selected) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const res = await explainFile(owner, repo, selected, action, branch);
      setExplanation(res.explanation);
    } catch (err) {
      setExplanation(`Failed: ${err instanceof Error ? err.message : "request failed"}`);
    } finally {
      setExplaining(false);
    }
  };

  const isIngested = selected ? ingestedPaths.includes(selected) : false;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Repository tree" className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        {entries.length > 0 ? (
          <TreeRow node={tree} depth={0} selected={selected} onSelect={select} expanded={expanded} toggle={toggle} />
        ) : (
          <p className="p-2 text-xs text-[var(--text-muted)]">Tree unavailable for this analysis.</p>
        )}
      </aside>

      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {selected ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="truncate text-sm text-accent">{selected}</code>
              <Badge className={cn(isIngested ? "text-[var(--success)]" : "text-[var(--text-muted)]")}>
                {isIngested ? "analyzed" : "not analyzed"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void runExplain("explain")} disabled={explaining}>
                {explaining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Explain file
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void runExplain("references")} disabled={explaining}>
                Find references
              </Button>
            </div>
          </div>
        ) : null}

        {explanation ? (
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p className="whitespace-pre-wrap">{explanation}</p>
          </div>
        ) : null}

        <div className="p-3">
          {selected ? (
            <FileViewer owner={owner} repo={repo} branch={branch} path={selected} />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">Select a file from the tree.</p>
          )}
        </div>
      </section>
    </div>
  );
}
