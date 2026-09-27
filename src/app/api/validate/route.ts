import { NextRequest } from "next/server";
import { parseGitHubUrl } from "@/lib/github/parser";
import { getRepository } from "@/lib/github/client";
import { toErrorResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      throw new AppError("INVALID_URL", "Enter a valid GitHub repository URL.");
    }
    const parsed = parseGitHubUrl(body.url);
    if (!parsed) {
      throw new AppError("INVALID_URL", "Enter a valid GitHub repository URL.");
    }
    const repo = await getRepository(parsed.owner, parsed.repo);
    return Response.json({
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch ?? repo.default_branch,
      defaultBranch: repo.default_branch,
      description: repo.description,
      stars: repo.stargazers_count,
    });
  } catch (err) {
    return toErrorResponse(err, "api.validate");
  }
}
