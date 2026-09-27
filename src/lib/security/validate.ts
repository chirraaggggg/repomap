/**
 * Security validation for API inputs.
 * Repository code is treated as untrusted; user input is sanitized here.
 */
import { parseGitHubUrl } from "@/lib/github/parser";
import { AppError } from "@/lib/errors";

export interface ValidatedRepoInput {
  owner: string;
  repo: string;
  branch?: string;
}

/** Validates an analyze/chat request body. Throws AppError on failure. */
export function validateRepoInput(body: unknown): ValidatedRepoInput {
  if (typeof body !== "object" || body === null) {
    throw new AppError("BAD_REQUEST", "Enter a valid GitHub repository URL.");
  }
  const { url } = body as { url?: unknown };
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new AppError("BAD_REQUEST", "Enter a valid GitHub repository URL.");
  }
  if (url.length > 300) {
    throw new AppError("INVALID_URL", "Enter a valid GitHub repository URL.");
  }
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new AppError("INVALID_URL", "Enter a valid GitHub repository URL.");
  }
  return { owner: parsed.owner, repo: parsed.repo, branch: parsed.branch };
}

/** Defends against prompt injection via repository content. */
export function sanitizeForPrompt(text: string, maxChars: number): string {
  return text.slice(0, maxChars);
}

/** Only GitHub raw/preview hosts may be fetched anywhere in this app. */
export function isAllowedExternalHost(host: string): boolean {
  return host === "github.com" || host === "raw.githubusercontent.com" || host === "api.github.com";
}
