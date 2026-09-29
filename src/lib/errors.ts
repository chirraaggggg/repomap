import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "PRIVATE_REPO"
  | "RATE_LIMIT"
  | "TOO_LARGE"
  | "AI_ERROR"
  | "AI_OUTPUT_TOO_LONG"
  | "AI_CONTEXT_TOO_LARGE"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_RESPONSE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_AUTH_ERROR"
  | "AI_UNKNOWN_ERROR"
  | "DATABASE_ERROR"
  | "TIMEOUT"
  | "BAD_REQUEST"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  NOT_FOUND: 404,
  PRIVATE_REPO: 403,
  RATE_LIMIT: 429,
  TOO_LARGE: 413,
  AI_ERROR: 502,
  AI_OUTPUT_TOO_LONG: 502,
  AI_CONTEXT_TOO_LARGE: 413,
  AI_RATE_LIMITED: 429,
  AI_INVALID_RESPONSE: 502,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_AUTH_ERROR: 502,
  AI_UNKNOWN_ERROR: 502,
  DATABASE_ERROR: 500,
  TIMEOUT: 504,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function errorResponse(code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

/**
 * Converts any thrown value into a safe API response.
 * Stack traces and internals are logged server-side only.
 */
export function toErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof AppError) {
    return errorResponse(err.code, err.message);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return errorResponse("BAD_REQUEST", first ? `${first.path.join(".")}: ${first.message}` : "Invalid request body.");
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[${context}]`, message);
  if (/rate limit/i.test(message)) return errorResponse("RATE_LIMIT", "GitHub API rate limit reached. Try again later or configure GITHUB_TOKEN.");
  if (/private/i.test(message)) return errorResponse("PRIVATE_REPO", "This repository appears to be private.");
  if (/not found/i.test(message)) return errorResponse("NOT_FOUND", "Repository could not be found.");
  if (/too large|size limit/i.test(message)) return errorResponse("TOO_LARGE", "This repository is too large to analyze.");
  if (/timeout|aborted/i.test(message)) return errorResponse("TIMEOUT", "The request timed out. Please try again.");
  return errorResponse("INTERNAL", "Something went wrong. Please try again.");
}
