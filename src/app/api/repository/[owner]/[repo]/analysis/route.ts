import { NextRequest } from "next/server";
import { loadAnalysis } from "@/lib/database/store";
import { toErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params;
    const branch = new URL(request.url).searchParams.get("branch") ?? undefined;
    const analysis = await loadAnalysis(owner, repo, branch);
    if (!analysis) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "No analysis found. Analyze the repository first." } },
        { status: 404 },
      );
    }
    return Response.json({
      repository: analysis.repository,
      analysis: analysis.payload,
    });
  } catch (err) {
    return toErrorResponse(err, "api.repository.analysis");
  }
}
