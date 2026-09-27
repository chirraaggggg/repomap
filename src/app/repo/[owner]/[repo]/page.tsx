import Link from "next/link";
import { loadAnalysis } from "@/lib/database/store";
import type { AnalysisPayload } from "@/types";
import { AnalysisView } from "./analysis-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ branch?: string }>;
}

export default async function RepoPage({ params, searchParams }: PageProps) {
  const { owner, repo } = await params;
  const { branch } = await searchParams;

  const decodedOwner = decodeURIComponent(owner);
  const decodedRepo = decodeURIComponent(repo);

  const loaded = await loadAnalysis(decodedOwner, decodedRepo, branch);

  if (!loaded) {
    // Analysis exists only after an analyze run; provide a helpful empty state.
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">No analysis yet for {decodedOwner}/{decodedRepo}</h1>
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

  const payload = loaded.payload as AnalysisPayload;

  return (
    <AnalysisView
      owner={decodedOwner}
      repo={decodedRepo}
      repository={loaded.repository}
      payload={payload}
      masterPrompt={loaded.masterPrompt}
      ingestedPaths={loaded.files.map((f) => f.path)}
    />
  );
}
