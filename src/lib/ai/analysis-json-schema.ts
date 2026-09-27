/**
 * Hand-written JSON Schema for repository analysis, meeting Groq's
 * strict structured-output requirements:
 * - every object declares additionalProperties: false
 * - every property is listed in required
 * - optional values are modeled as nullable types, not missing properties
 * - only supported constructs: object, array, string, number, boolean, null
 *
 * Keep this in sync with AnalysisResultSchema in ./analysis-schema.ts.
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectName",
    "summary",
    "problem",
    "audience",
    "howItWorks",
    "techStack",
    "architecture",
    "architectureDiagram",
    "directoryExplanation",
    "importantFiles",
    "keyFlows",
    "setupInstructions",
    "environmentVariables",
    "database",
    "authentication",
    "api",
    "dependencies",
    "risks",
    "suggestedLearningPath",
    "learningPath",
  ],
  properties: {
    projectName: { type: "string" },
    summary: { type: "string" },
    problem: { type: "string" },
    audience: { type: "string" },
    howItWorks: { type: "string" },
    techStack: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "evidence"],
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    architecture: { type: "string" },
    architectureDiagram: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "layer", "detail"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              layer: { type: "string", enum: ["client", "frontend", "backend", "data", "external"] },
              detail: { type: ["string", "null"] },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "label"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    directoryExplanation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "purpose"],
        properties: {
          path: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
    importantFiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "role", "why", "importance"],
        properties: {
          path: { type: "string" },
          role: { type: "string" },
          why: { type: "string" },
          importance: { type: "number" },
        },
      },
    },
    keyFlows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "steps"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
      },
    },
    setupInstructions: { type: "string" },
    environmentVariables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "purpose"],
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
    database: { type: "string" },
    authentication: { type: "string" },
    api: { type: "string" },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version", "type"],
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          type: { type: "string", enum: ["runtime", "development"] },
        },
      },
    },
    risks: { type: "array", items: { type: "string" } },
    suggestedLearningPath: { type: "array", items: { type: "string" } },
    learningPath: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "title", "goal", "files"],
        properties: {
          level: { type: "number" },
          title: { type: "string" },
          goal: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
