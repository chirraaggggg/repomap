/**
 * Language detection from file extensions.
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".dart": "Dart",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".fish": "Shell",
  ".sql": "SQL",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".html": "HTML",
  ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".astro": "Astro",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".svg": "SVG",
  ".dockerfile": "Dockerfile",
  ".lua": "Lua",
  ".pl": "Perl",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".zig": "Zig",
  ".hbs": "Handlebars",
  ".twig": "Twig",
  ".twigc": "Twig",
};

export function detectLanguage(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  if (base.toLowerCase() === "dockerfile") return "Dockerfile";
  if (base.toLowerCase() === "makefile") return "Makefile";
  if (base.toLowerCase().startsWith(".env")) return "Dotenv";
  if (base.toLowerCase() === "license") return "Text";

  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot).toLowerCase();
  return EXTENSION_LANGUAGE[ext] ?? null;
}
