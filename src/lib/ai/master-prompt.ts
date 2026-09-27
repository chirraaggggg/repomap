/**
 * AI-ready master prompt generation.
 */
import { renderAsciiTree } from "@/lib/github/ascii-tree";
import { estimateTokens, MAX_MASTER_PROMPT_TOKENS } from "@/lib/ingestion/tokenizer";
import type { AnalysisResult, IngestionResult, RepositoryMetadata, RepoStats } from "@/types";

export type PromptMode = "quick" | "detailed" | "developer";

const MODE_PROMPTS: Record<PromptMode, string> = {
  quick: `You are an expert software engineer helping me understand this repository. Be concise.

Repository:
{FULL_NAME} ({BRANCH})

Project:
{SUMMARY}

Tech stack:
{TECH_STACK}

Directory structure:
{TREE}

Rules:
1. Use the provided repository context.
2. Reference actual file paths.
3. Never invent functionality.
4. If information is missing, say so.`,
  detailed: `You are an expert software engineer helping me understand this repository.

Repository:
{FULL_NAME} ({BRANCH})

Project:
{SUMMARY}

Problem it solves:
{PROBLEM}

Tech stack:
{TECH_STACK}

Architecture:
{ARCHITECTURE}

Directory structure:
{TREE}

Important files:
{IMPORTANT_FILES}

Key flows:
{KEY_FLOWS}

Setup:
{SETUP}

Relevant source code:
{SOURCE}

Your job is to answer questions about this codebase.
Rules:
1. Use the provided repository context.
2. Reference actual file paths.
3. Never invent functionality.
4. Explain relationships between files.
5. Explain unfamiliar concepts.
6. If information is missing, say so.
7. Prefer concrete examples.
8. When suggesting code changes, identify the files that should change.`,
  developer: `You are a senior engineer onboarding me as a new contributor to this repository.

Repository:
{FULL_NAME} ({BRANCH})

Project:
{SUMMARY}

Tech stack:
{TECH_STACK}

Architecture:
{ARCHITECTURE}

Directory structure:
{TREE}

Important files (with roles):
{IMPORTANT_FILES}

Key flows:
{KEY_FLOWS}

Setup & environment:
{SETUP}
{ENV_VARS}

Relevant source code:
{SOURCE}

Your job is to help me modify this codebase confidently.
Rules:
1. Ground every answer in the provided source.
2. Reference actual file paths and line-level detail where possible.
3. Never invent APIs, props, or database columns.
4. When proposing changes, list exact files to touch and the order of operations.
5. Flag risks, edge cases, and tests to update.
6. If information is missing, say so explicitly.`,
};

const HEAD_BUDGET_RATIO = 0.75;

function trimContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.floor(maxChars * 0.8))}\n\n/* … truncated … */\n\n${content.slice(-Math.floor(maxChars * 0.15))}`;
}

export function generateMasterPrompt(
  ingestion: IngestionResult,
  analysis: AnalysisResult,
  mode: PromptMode = "detailed",
): string {
  const { metadata } = ingestion;

  const template = MODE_PROMPTS[mode];

  const tech = analysis.techStack.length
    ? analysis.techStack.map((t) => `- ${t.name} (${t.category})`).join("\n")
    : (ingestion.techStack.map((t) => `- ${t.name} (${t.category})`).join("\n") || "Not detected");

  const tree = renderAsciiTree(
    ingestion.tree.entries.filter((e) => e.type === "blob"),
    mode === "quick" ? 60 : 150,
  );

  const importantFiles = analysis.importantFiles.length
    ? analysis.importantFiles.map((f) => `- ${f.path} — ${f.role}${f.why ? `: ${f.why}` : ""}`).join("\n")
    : "Not determined";

  const keyFlows = analysis.keyFlows.length
    ? analysis.keyFlows
        .map((f) => `- ${f.name}: ${f.steps.join(" → ")}`)
        .join("\n")
    : "Not determined";

  const envVars = analysis.environmentVariables.length
    ? `\nEnvironment variables:\n${analysis.environmentVariables.map((v) => `- ${v.name}: ${v.purpose}`).join("\n")}`
    : "";

  // Source code: prioritize analysis-flagged files, then by score.
  const budget = Math.floor(MAX_MASTER_PROMPT_TOKENS * HEAD_BUDGET_RATIO);
  let sourceBlock = "";
  {
    const priority = [
      ...analysis.importantFiles.map((f) => f.path),
      ...ingestion.ingestedFiles
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((f) => f.path),
    ];
    const seen = new Set<string>();
    const ordered = priority.filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });

    const byPath = new Map(ingestion.ingestedFiles.map((f) => [f.path, f]));
    const parts: string[] = [];
    let used = 0;
    for (const path of ordered) {
      const file = byPath.get(path);
      if (!file) continue;
      const tokens = estimateTokens(file.content);
      if (used + tokens > budget) break;
      used += tokens;
      parts.push(`--- ${file.path} ---\n${trimContent(file.content, Math.floor(file.content.length))}`);
    }
    sourceBlock = parts.join("\n\n") || "(source code omitted — context too large)";
  }

  const prompt = template
    .replace("{FULL_NAME}", `${metadata.fullName} (https://github.com/${metadata.fullName})`)
    .replace("{BRANCH}", metadata.branch)
    .replace("{SUMMARY}", analysis.summary || "(not available)")
    .replace("{PROBLEM}", analysis.problem || "(not available)")
    .replace("{TECH_STACK}", tech)
    .replace("{ARCHITECTURE}", analysis.architecture || "(not available)")
    .replace("{TREE}", tree)
    .replace("{IMPORTANT_FILES}", importantFiles)
    .replace("{KEY_FLOWS}", keyFlows)
    .replace("{SETUP}", analysis.setupInstructions || "(not available)")
    .replace("{ENV_VARS}", envVars)
    .replace("{SOURCE}", sourceBlock);

  return prompt;
}

export function generateAllPromptModes(
  ingestion: IngestionResult,
  analysis: AnalysisResult,
): Record<PromptMode, string> {
  return {
    quick: generateMasterPrompt(ingestion, analysis, "quick"),
    detailed: generateMasterPrompt(ingestion, analysis, "detailed"),
    developer: generateMasterPrompt(ingestion, analysis, "developer"),
  };
}

export interface PromptStatsInput {
  prompt: string;
}

export function promptTokenEstimate(prompt: string): number {
  return estimateTokens(prompt);
}

// Re-exports for route convenience
export type { RepositoryMetadata, RepoStats };
