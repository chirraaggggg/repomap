import { NextRequest } from "next/server";
import { z } from "zod";
import { loadAnalysis } from "@/lib/database/store";
import { getFileContent } from "@/lib/github/client";
import { toErrorResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  path: z.string().min(1).max(500),
  branch: z.string().max(200).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params;
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      path: url.searchParams.get("path") ?? undefined,
      branch: url.searchParams.get("branch") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: { code: "BAD_REQUEST", message: "Missing ?path= parameter." } }, { status: 400 });
    }
    const { path, branch } = parsed.data;

    // Fast path: the ingested analysis is in the server store.
    const analysis = await loadAnalysis(owner, repo, branch);
    if (analysis) {
      const file = analysis.files.find((f) => f.path === path);
      if (file) {
        return Response.json({
          path: file.path,
          language: file.language,
          content: file.content,
          lines: file.content.split("\n").length,
          importance: file.importanceScore,
          ingested: true,
        });
      }
      // Analyzed, but this specific file was not ingested — fetch from GitHub
      // on demand so every tree file is openable.
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

    // Cold store (server restart / different instance / direct URL navigation):
    // still serve the file straight from GitHub using the requested or default
    // branch, so the Files tab works without a re-analysis.
    let resolvedBranch = branch;
    if (!resolvedBranch) {
      const { getRepository } = await import("@/lib/github/client");
      const repoMeta = await getRepository(owner, repo);
      resolvedBranch = repoMeta.default_branch;
    }
    const content = await getFileContent(owner, repo, resolvedBranch, path);
    return Response.json({
      path,
      language: null,
      content,
      lines: content.split("\n").length,
      ingested: false,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") {
      return Response.json({ error: { code: "NOT_FOUND", message: "File not found in repository." } }, { status: 404 });
    }
    return toErrorResponse(err, "api.repository.files");
  }
}
