"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, GitBranch, Loader2, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { refreshAnalysis } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { AnalysisPayload, RepositoryRecord } from "@/types";
import { OverviewTab } from "./tabs/overview-tab";
import { ArchitectureTab } from "./tabs/architecture-tab";
import { FilesTab } from "./tabs/files-tab";
import { PromptTab } from "./tabs/prompt-tab";
import { ChatTab } from "./tabs/chat-tab";
import { LearnTab } from "./tabs/learn-tab";

interface Props {
  owner: string;
  repo: string;
  repository: RepositoryRecord;
  payload: AnalysisPayload;
  masterPrompt: string;
  ingestedPaths: string[];
}

export function AnalysisView({ owner, repo, repository, payload, masterPrompt, ingestedPaths }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const m = payload.metadata;
  const stats = payload.stats;

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshAnalysis(owner, repo, repository.branch);
      router.refresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-col gap-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="font-mono text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">repomap</Link>
              <span className="text-[var(--text-muted)]">/</span>
              <h1 className="truncate font-mono text-lg font-semibold">
                {m.owner}/<span className="text-accent">{m.name}</span>
              </h1>
              <Badge className="gap-1 font-mono">
                <GitBranch className="h-3 w-3" /> {m.branch}
              </Badge>
            </div>
            {m.description ? <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{m.description}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={m.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 text-xs hover:bg-[var(--surface-2)]"
            >
              GitHub <ExternalLink className="h-3 w-3" />
            </a>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" /> {formatNumber(m.stars)}</span>
          <span>{formatNumber(m.forks)} forks</span>
          <span>{formatNumber(stats.totalFiles)} files</span>
          <span>{formatNumber(stats.analyzedFiles)} analyzed</span>
          <span>{formatNumber(stats.totalLines)} lines</span>
          <span>~{formatNumber(stats.estimatedTokens)} tokens</span>
          <span>{formatBytes(stats.sizeBytes)} read</span>
          <span>commit {repository.commitSha.slice(0, 7)}</span>
        </div>
        {refreshError ? <p className="text-sm text-[var(--danger)]">{refreshError}</p> : null}
      </header>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="architecture">Architecture</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="learn">Learn</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab payload={payload} />
        </TabsContent>
        <TabsContent value="architecture">
          <ArchitectureTab payload={payload} />
        </TabsContent>
        <TabsContent value="files">
          <FilesTab owner={owner} repo={repo} branch={repository.branch} payload={payload} ingestedPaths={ingestedPaths} />
        </TabsContent>
        <TabsContent value="prompt">
          <PromptTab
            owner={owner}
            repo={repo}
            branch={repository.branch}
            masterPrompt={masterPrompt}              treeEntries={payload.treeEntries ?? []}
            analysisFiles={payload.importantFiles ?? []}
          />
        </TabsContent>
        <TabsContent value="chat">
          <ChatTab owner={owner} repo={repo} branch={repository.branch} />
        </TabsContent>
        <TabsContent value="learn">
          <LearnTab payload={payload} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

export function DownloadPromptButton({ getText, label }: { getText: () => string; label?: string }) {
  const handleDownload = () => {
    const blob = new Blob([getText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repository-context.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <Download className="h-3.5 w-3.5" />
      {label ?? "Download TXT"}
    </Button>
  );
}
