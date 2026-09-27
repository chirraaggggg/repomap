import { z } from "zod";

/**
 * Schema for AI-generated repository analysis.
 * Every string field tolerates absence so a partially-successful
 * generation still renders.
 */
export const AnalysisResultSchema = z.object({
  projectName: z.string().default(""),
  summary: z.string().default(""),
  problem: z.string().default(""),
  audience: z.string().default(""),
  howItWorks: z.string().default(""),
  techStack: z
    .array(
      z.object({
        name: z.string(),
        category: z.string().default("Other"),
        evidence: z.string().default(""),
      }),
    )
    .default([]),
  architecture: z.string().default(""),
  architectureDiagram: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          layer: z
            .enum(["client", "frontend", "backend", "data", "external"])
            .catch("backend"),
          // Strict JSON schema models optionality as nullable; accept both.
          detail: z.string().nullable().optional(),
        }),
      ),
      edges: z.array(
        z.object({              from: z.string(),
              to: z.string(),
              label: z.string().nullable().optional(),
        }),
      ),
    })
    .nullable()
    .default(null),
  directoryExplanation: z
    .array(z.object({ path: z.string(), purpose: z.string() }))
    .default([]),
  importantFiles: z
    .array(
      z.object({
        path: z.string(),
        role: z.string().default(""),
        why: z.string().default(""),
        importance: z.coerce.number().default(50),
      }),
    )
    .default([]),
  keyFlows: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        steps: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  setupInstructions: z.string().default(""),
  environmentVariables: z
    .array(z.object({ name: z.string(), purpose: z.string().default("") }))
    .default([]),
  database: z.string().default(""),
  authentication: z.string().default(""),
  api: z.string().default(""),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().default(""),
        type: z.enum(["runtime", "development"]).catch("runtime"),
      }),
    )
    .default([]),
  risks: z.array(z.string()).default([]),
  suggestedLearningPath: z.array(z.string()).default([]),
  learningPath: z
    .array(
      z.object({
        level: z.coerce.number(),
        title: z.string(),
        goal: z.string().default(""),
        files: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type AnalysisResultSchema = z.infer<typeof AnalysisResultSchema>;
