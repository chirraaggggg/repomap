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
    const url = new URL(request.url);
    const branch = url.searchParams.get("branch") ?? undefined;
    const path = url.searchParams.get("path");
    if (!path) {
      return Response.json({ error: { code: "BAD_REQUEST", message: "Missing ?path= parameter." } }, { status: 400 });
    }

    const analysis = await loadAnalysis(owner, repo, branch);
    if (!analysis) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Analyze this repository first." } },
        { status: 404 },
      );
    }

    const file = analysis.files.find((f) => f.path === path);
    if (!file) {
      // Not ingested — fetch from GitHub on demand so every tree file is openable.
      const { getFileContent } = await import("@/lib/github/client");
      try {
        const content = await getFileContent(owner, repo, analysis.repository.branch, path);
        return Response.json({ path, language: null, content, lines: content.split("\n").length, ingested: false });
      } catch {
        return Response.json(
          { error: { code: "NOT_FOUND", message: "File not found in repository." } },
          { status: 404 },
        );
      }
    }

    return Response.json({
      path: file.path,
      language: file.language,
      content: file.content,
      lines: file.content.split("\n").length,
      importance: file.importanceScore,
      ingested: true,
    });
  } catch (err) {
    return toErrorResponse(err, "api.repository.files");
  }
}
