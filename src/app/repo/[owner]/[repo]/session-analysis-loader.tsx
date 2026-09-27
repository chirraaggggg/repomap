"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  ANALYSIS_LOADING,
  getAnalysisSnapshot,
  subscribeToAnalysis,
  type StoredAnalysis,
} from "@/lib/analysis-storage";
import { AnalysisView } from "./analysis-view";

interface Props {
  owner: string;
  repo: string;
  branch?: string;
}

type Snapshot = { loading: true } | StoredAnalysis | null;

/**
 * Rendered only when the server has no analysis in memory. Reads the
 * analysis saved in sessionStorage by the homepage flow before navigation.
 *
 * useSyncExternalStore keeps this hydration-safe: the server snapshot is
 * "loading", and React re-reads the client snapshot after hydration
 * (no setState-in-effect, per React compiler rules).
 */
export function SessionAnalysisLoader({ owner, repo, branch }: Props) {
  const stored = useSyncExternalStore<Snapshot>(
    subscribeToAnalysis,
    () => getAnalysisSnapshot(owner, repo, branch),
    () => ANALYSIS_LOADING,
  );

  if (stored === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">
          No analysis yet for {owner}/{repo}
        </h1>
        <p className="text-[var(--text-secondary)]">
          Run an analysis first — paste the repository URL on the homepage.
        </p>
        <Link
          href="/"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Analyze a repository
        </Link>
      </main>
    );
  }

  if ("loading" in stored) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Loading analysis…</p>
      </main>
    );
  }

  return (
    <AnalysisView
      owner={owner}
      repo={repo}
      repository={stored.repository}
      payload={stored.payload}
      masterPrompt={stored.masterPrompt}
      ingestedPaths={stored.ingestedPaths}
    />
  );
}
