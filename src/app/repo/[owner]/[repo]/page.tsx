import { loadAnalysis } from "@/lib/database/store";
import type { AnalysisPayload } from "@/types";
import { AnalysisView } from "./analysis-view";
import { SessionAnalysisLoader } from "./session-analysis-loader";

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
    // Server store has nothing (fresh server, or cross-bundle); the client
    // loader checks sessionStorage for the analysis saved before navigation.
    return <SessionAnalysisLoader owner={decodedOwner} repo={decodedRepo} branch={branch} />;
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
