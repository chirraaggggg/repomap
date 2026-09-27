/**
 * Executes AI analysis over the ingested repository context.
 */
import { AnalysisResultSchema, type AnalysisResultSchema as AnalysisResult } from "./analysis-schema";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from "./analysis-prompt";
import { parseJsonLoose } from "./gemini";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { IngestionResult } from "@/types";
import { z } from "zod";

export async function runAnalysis(ingestion: IngestionResult): Promise<AnalysisResult> {
  const provider = getProvider();
  const prompt = buildAnalysisPrompt({
    metadata: ingestion.metadata,
    stats: ingestion.stats,
    techStack: ingestion.techStack,
    context: ingestion.context,
  });

  logger.info("ai.analyze", `Analyzing ${ingestion.metadata.fullName} (${ingestion.contextTokens} tokens)`);

  const raw = await provider.generateText(prompt, {
    system: ANALYSIS_SYSTEM_PROMPT,
    temperature: 0.2,
    json: true,
  });

  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch (err) {
    logger.error("ai.analyze", "Failed to parse AI JSON", err instanceof Error ? err.message : err);
    throw new AppError("AI_ERROR", "AI analysis returned malformed JSON. Please retry.");
  }

  // Filter importantFiles to paths that actually exist in the repository.
  const realPaths = new Set(ingestion.tree.entries.map((e) => e.path));
  const prevalidated = sanitizeAnalysis(parsed, realPaths);
  const result = AnalysisResultSchema.parse(prevalidated);
  return result;
}

function getProvider() {
  // Lazy import to keep bundle graph clean in edge tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAIProvider } = require("./gemini") as typeof import("./gemini");
  return getAIProvider();
}

const FileRefSchema = z.object({ path: z.string() });

/**
 * Drops hallucinated file references and trims prompt-injection-looking noise.
 */
export function sanitizeAnalysis(data: unknown, realPaths: Set<string>): unknown {
  if (typeof data !== "object" || data === null) return data;
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.importantFiles)) {
    obj.importantFiles = obj.importantFiles.filter((f) => {
      if (typeof f !== "object" || f === null) return false;
      const p = FileRefSchema.safeParse(f);
      return p.success && realPaths.has(p.data.path);
    });
  }

  if (Array.isArray(obj.learningPath)) {
    obj.learningPath = obj.learningPath.map((level) => {
      if (typeof level !== "object" || level === null) return level;
      const l = level as Record<string, unknown>;
      if (Array.isArray(l.files)) {
        l.files = l.files.filter((f) => typeof f === "string" && realPaths.has(f));
      }
      return l;
    });
  }

  if (Array.isArray(obj.directoryExplanation)) {
    obj.directoryExplanation = obj.directoryExplanation.filter((d) => {
      if (typeof d !== "object" || d === null) return false;
      const parsed = z.object({ path: z.string() }).safeParse(d);
      return parsed.success && (realPaths.has(parsed.data.path) || [...realPaths].some((p) => p.startsWith(parsed.data.path)));
    });
  }

  return obj;
}
