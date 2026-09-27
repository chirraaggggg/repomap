/**
 * Tech stack detection using actual repository evidence.
 * A technology is only reported when a real file proves it.
 */
import type { IngestedFile, RepositoryMetadata, TechStackItem } from "@/types";

interface Detection {
  name: string;
  category: string;
  /** package.json dependency names that prove it */
  deps?: string[];
  /** file names (lowercased, basename) that prove it */
  files?: string[];
  /** path fragments that prove it */
  paths?: string[];
  /** content patterns (RegExp) applied to candidate files */
  content?: Array<{ test: RegExp; in: RegExp }>;
}

const DETECTIONS: Detection[] = [
  { name: "Next.js", category: "Framework", deps: ["next"] },
  { name: "React", category: "Frontend", deps: ["react"] },
  { name: "Vue", category: "Frontend", deps: ["vue"] },
  { name: "Svelte", category: "Frontend", deps: ["svelte"] },
  { name: "Angular", category: "Frontend", deps: ["@angular/core"] },
  { name: "Astro", category: "Framework", deps: ["astro"] },
  { name: "Nuxt", category: "Framework", deps: ["nuxt"] },
  { name: "Remix", category: "Framework", deps: ["@remix-run/node"] },
  { name: "SvelteKit", category: "Framework", deps: ["@sveltejs/kit"] },
  { name: "Tailwind CSS", category: "Styling", deps: ["tailwindcss"] },
  { name: "TypeScript", category: "Language", files: ["tsconfig.json"] },
  { name: "Node.js", category: "Runtime", files: ["package.json"] },
  { name: "Express", category: "Backend", deps: ["express"] },
  { name: "NestJS", category: "Backend", deps: ["@nestjs/core"] },
  { name: "Fastify", category: "Backend", deps: ["fastify"] },
  { name: "Hono", category: "Backend", deps: ["hono"] },
  { name: "Prisma", category: "Database", deps: ["prisma", "@prisma/client"], files: ["schema.prisma"] },
  { name: "Drizzle", category: "Database", deps: ["drizzle-orm"] },
  { name: "Supabase", category: "Database", deps: ["@supabase/supabase-js", "@supabase/ssr"], files: ["supabase/config.toml"] },
  { name: "PostgreSQL", category: "Database", deps: ["pg", "postgres"], content: [{ test: /postgres/i, in: /(^|\/)(schema\.prisma|drizzle\.config\.[a-z]+|.*\.sql)$/ }] },
  { name: "MongoDB", category: "Database", deps: ["mongodb", "mongoose"] },
  { name: "Redis", category: "Database", deps: ["redis", "ioredis"] },
  { name: "SQLite", category: "Database", deps: ["better-sqlite3", "sqlite3"] },
  { name: "Stripe", category: "Payments", deps: ["stripe", "@stripe/stripe-js"] },
  { name: "OpenAI", category: "AI", deps: ["openai"] },
  { name: "Gemini", category: "AI", deps: ["@google/genai", "@google/generative-ai"] },
  { name: "Anthropic", category: "AI", deps: ["@anthropic-ai/sdk"] },
  { name: "Vercel AI SDK", category: "AI", deps: ["ai"] },
  { name: "Docker", category: "Infrastructure", files: ["dockerfile"] },
  { name: "Docker Compose", category: "Infrastructure", files: ["docker-compose.yml", "docker-compose.yaml"] },
  { name: "Kubernetes", category: "Infrastructure", paths: ["k8s/", "kubernetes/", "helm/"] },
  { name: "Terraform", category: "Infrastructure", files: ["main.tf"] },
  { name: "GitHub Actions", category: "CI/CD", paths: [".github/workflows/"] },
  { name: "Vitest", category: "Testing", deps: ["vitest"] },
  { name: "Jest", category: "Testing", deps: ["jest"] },
  { name: "Playwright", category: "Testing", deps: ["@playwright/test"] },
  { name: "Pytest", category: "Testing", files: ["pytest.ini", "conftest.py"] },
  { name: "Zod", category: "Validation", deps: ["zod"] },
  { name: "tRPC", category: "API", deps: ["@trpc/server"] },
  { name: "GraphQL", category: "API", deps: ["graphql", "apollo-server", "@apollo/server"] },
  { name: "Firebase", category: "Platform", deps: ["firebase", "firebase-admin"] },
  { name: "AWS SDK", category: "Platform", deps: ["aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb"] },
  { name: "Python", category: "Language", files: ["requirements.txt", "pyproject.toml", "setup.py"] },
  { name: "Django", category: "Framework", files: ["manage.py"], deps: ["django"] },
  { name: "Flask", category: "Framework", deps: ["flask"] },
  { name: "FastAPI", category: "Framework", deps: ["fastapi"] },
  { name: "Go", category: "Language", files: ["go.mod"] },
  { name: "Rust", category: "Language", files: ["cargo.toml"] },
  { name: "Ruby", category: "Language", files: ["gemfile"] },
  { name: "Java", category: "Language", files: ["pom.xml", "build.gradle"] },
  { name: "Swift", category: "Language", files: ["package.swift"] },
  { name: "Kotlin", category: "Language", files: ["build.gradle.kts"] },
];

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function detectTechStack(files: IngestedFile[], metadata: RepositoryMetadata): TechStackItem[] {
  const byBasename = new Map<string, IngestedFile>();
  for (const f of files) byBasename.set(basename(f.path).toLowerCase(), f);

  const depSet = new Set<string>();
  const pkg = byBasename.get("package.json");
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const dep of [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})]) {
        depSet.add(dep);
      }
    } catch {
      // malformed package.json — skip dependency detection
    }
  }
  const req = byBasename.get("requirements.txt");
  if (req) {
    for (const line of req.content.split("\n")) {
      const match = line.trim().match(/^[A-Za-z0-9._-]+/);
      const name = match?.[0]?.toLowerCase();
      if (name) depSet.add(name);
    }
  }
  const pyproject = byBasename.get("pyproject.toml");
  if (pyproject) {
    const depsMatch = pyproject.content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depsMatch?.[1]) {
      for (const m of depsMatch[1].matchAll(/"([^"]+)"/g)) {
        depSet.add((m[1] ?? "").toLowerCase().split("[")[0] ?? "");
      }
    }
  }

  const detected: TechStackItem[] = [];
  const seen = new Set<string>();

  for (const d of DETECTIONS) {
    let evidence: string | null = null;

    if (d.deps) {
      const found = d.deps.find((dep) => depSet.has(dep));
      if (found) evidence = `Dependency "${found}"`;
    }
    if (!evidence && d.files) {
      const found = d.files.find((name) => byBasename.has(name));
      if (found) evidence = `File "${found}"`;
    }
    if (!evidence && d.paths) {
      const found = d.paths.find((p) => files.some((f) => f.path.startsWith(p)));
      if (found) evidence = `Path "${found}"`;
    }
    if (!evidence && d.content) {
      for (const rule of d.content) {
        const candidate = files.find((f) => rule.in.test(f.path) && rule.test.test(f.content));
        if (candidate) {
          evidence = `Pattern in ${candidate.path}`;
          break;
        }
      }
    }

    if (evidence && !seen.has(d.name)) {
      seen.add(d.name);
      detected.push({ name: d.name, category: d.category, evidence });
    }
  }

  // Fallback: GitHub-reported primary language when nothing else matched.
  if (detected.length === 0 && metadata.language) {
    detected.push({ name: metadata.language, category: "Language", evidence: "Repository primary language" });
  }

  return detected;
}
