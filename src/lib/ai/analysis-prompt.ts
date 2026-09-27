/**
 * Prompt construction for repository analysis.
 * Grounding rules are strict: no invention beyond the provided context.
 */
import type { RepositoryMetadata, RepoStats, TechStackItem } from "@/types";

export const ANALYSIS_SYSTEM_PROMPT = `You are analyzing an actual GitHub repository. Only make claims supported by the provided repository context. If something cannot be determined, explicitly say so.

Rules:
1. Reference real file paths exactly as they appear in the context.
2. Never invent functionality, endpoints, tables, or integrations.
3. Prefer concrete details from the code over generic descriptions.
4. Respond with valid JSON only, matching the requested schema.`;

export interface AnalysisPromptInput {
  metadata: RepositoryMetadata;
  stats: RepoStats;
  techStack: TechStackItem[];
  context: string;
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const { metadata, stats, techStack, context } = input;

  const techList = techStack.map((t) => `- ${t.name} (${t.category}) — evidence: ${t.evidence}`).join("\n");

  const statsList = [
    `Files: ${stats.totalFiles} total, ${stats.analyzedFiles} analyzed, ${stats.ignoredFiles} ignored`,
    `Lines analyzed: ${stats.totalLines}`,
    `Estimated tokens: ${stats.estimatedTokens}`,
    `Languages: ${stats.languages.map((l) => `${l.name} ${l.percentage}%`).join(", ") || "unknown"}`,
    `Largest files: ${stats.largestFiles.map((f) => `${f.path} (${f.size} bytes)`).join(", ") || "unknown"}`,
  ].join("\n");

  return `Analyze the following repository and produce a structured JSON object.

## Repository metadata
- Full name: ${metadata.fullName}
- Branch: ${metadata.branch}
- Description: ${metadata.description ?? "(none)"}
- Primary language (GitHub): ${metadata.language ?? "(none)"}
- Stars: ${metadata.stars}, Forks: ${metadata.forks}
- Topics: ${metadata.topics.join(", ") || "(none)"}

## Computed statistics
${statsList}

## Pre-detected tech stack (verify against code; remove entries you cannot confirm, add missing ones)
${techList || "(none pre-detected)"}

## Required JSON schema
{
  "projectName": "string",
  "summary": "2-4 sentence explanation of what this project is, understandable to a developer seeing it for the first time",
  "problem": "What problem does it solve?",
  "audience": "Who is it for? Only state if supported by README/code, otherwise say it cannot be determined",
  "howItWorks": "Explain the major flow through the code",
  "techStack": [{ "name": "", "category": "", "evidence": "file or dependency that proves it" }],
  "architecture": "Prose explanation of the architecture with real file paths",
  "architectureDiagram": {
    "nodes": [{ "id": "short-id", "label": "Component", "layer": "client|frontend|backend|data|external", "detail": "optional file path" }],
    "edges": [{ "from": "id", "to": "id", "label": "optional" }]
  },
  "directoryExplanation": [{ "path": "src/", "purpose": "what lives here" }],
  "importantFiles": [{ "path": "", "role": "", "why": "why it matters", "importance": 0-100 }],
  "keyFlows": [{ "name": "", "description": "", "steps": ["Step A", "Step B"] }],
  "setupInstructions": "How to run this project locally, derived from README/package.json scripts",
  "environmentVariables": [{ "name": "", "purpose": "" }],
  "database": "What database/storage is used and where the schema lives, or 'not found in repository'",
  "authentication": "How auth works, or 'not found in repository'",
  "api": "HTTP/API surface, or 'not found in repository'",
  "dependencies": [{ "name": "", "version": "", "type": "runtime|development" }],
  "risks": ["Observations about code health, security or maintainability grounded in evidence"],
  "suggestedLearningPath": ["ordered reading steps"],
  "learningPath": [{ "level": 1, "title": "Understand the problem", "goal": "", "files": ["path"] }]
}

## Repository context
${context}`;
}
