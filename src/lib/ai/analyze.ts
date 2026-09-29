/**
 * Executes AI analysis over the ingested repository context.
 * Uses strict structured output (json_schema) via the AI manager, then
 * validates. Accepts optional BYOK credentials for the request.
 */
import { AnalysisResultSchema, type AnalysisResultSchema as AnalysisResult } from "./analysis-schema";
import { ANALYSIS_JSON_SCHEMA } from "./analysis-json-schema";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from "./analysis-prompt";
import { getAI } from "./manager";
import { parseJsonLoose } from "./providers/groq";
import type { ProviderCredentials } from "./types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { IngestionResult } from "@/types";
import { z } from "zod";

export async function runAnalysis(ingestion: IngestionResult, credentials?: ProviderCredentials): Promise<AnalysisResult> {
  const model = getAI(credentials);
  const prompt = buildAnalysisPrompt({
    metadata: ingestion.metadata,
    stats: ingestion.stats,
    techStack: ingestion.techStack,
    context: ingestion.context,
  });

  logger.info(
    "ai.analyze",
    `Analyzing ${ingestion.metadata.fullName}: selectedFiles=${ingestion.ingestedFiles.length} contextTokens=${ingestion.contextTokens} completionRequest=6000 effort=low byok=${Boolean(credentials)}`,
  );

  // Strict structured output: the model must emit JSON matching the schema.
  // Completion budget is re-capped inside the provider so that input + output
  // always fits the per-request envelope.
  const raw = await model.generateText(prompt, {
    system: ANALYSIS_SYSTEM_PROMPT,
    temperature: 0.2,
    maxOutputTokens: 6_000,
    reasoningEffort: "low",
    jsonSchema: { name: "repository_analysis", schema: ANALYSIS_JSON_SCHEMA },
  });

  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch (err) {
    logger.error("ai.analyze", "Failed to parse AI JSON", err instanceof Error ? err.message : err);
    throw new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
  }

  const parsedKeys = typeof parsed === "object" && parsed !== null ? Object.keys(parsed).length : 0;
  logger.info("ai.analyze", `Parsed response: top-levelKeys=${parsedKeys}`);

  // Filter importantFiles to paths that actually exist in the repository.
  const realPaths = new Set(ingestion.tree.entries.map((e) => e.path));
  const prevalidated = sanitizeAnalysis(parsed, realPaths);

  const validated = AnalysisResultSchema.safeParse(prevalidated);
  if (!validated.success) {
    const summary = validated.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    logger.error("ai.analyze", `Schema validation failed with ${validated.error.issues.length} issue(s): ${summary}`);
    throw new AppError("AI_INVALID_RESPONSE", "The AI returned an invalid response. Please try again.");
  }
  logger.info("ai.analyze", "Schema validation OK");
  return validated.data;
}

const FileRefSchema = z.object({ path: z.string() });

/**
 * Deterministic array bounds — enforced post-parse regardless of what the
 * model emits, keeping every response within the output budget.
 */
const ARRAY_LIMITS: Record<string, number> = {
  techStack: 10,
  importantFiles: 15,
  keyFlows: 8,
  dependencies: 15,
  risks: 8,
  learningPath: 8,
  suggestedLearningPath: 8,
  directoryExplanation: 10,
  environmentVariables: 10,
};

/**
 * Drops hallucinated file references, trims prompt-injection-looking noise,
 * and bounds array sizes.
 */
export function sanitizeAnalysis(data: unknown, realPaths: Set<string>): unknown {
  if (typeof data !== "object" || data === null) return data;
  const obj = data as Record<string, unknown>;

  for (const [field, limit] of Object.entries(ARRAY_LIMITS)) {
    const value = obj[field];
    if (Array.isArray(value) && value.length > limit) {
      obj[field] = value.slice(0, limit);
    }
  }

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
