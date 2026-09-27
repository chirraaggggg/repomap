"use client";

import { useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-markdown";

const LANG_MAP: Record<string, string> = {
  TypeScript: "typescript",
  JavaScript: "javascript",
  JSON: "json",
  CSS: "css",
  SCSS: "css",
  Python: "python",
  Shell: "bash",
  Dockerfile: "bash",
  YAML: "yaml",
  SQL: "sql",
  Go: "go",
  Rust: "rust",
  Markdown: "markdown",
  HTML: "markup",
};

Prism.manual = true;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function CodeBlock({ code, language, className }: { code: string; language?: string | null; className?: string }) {
  const prismLang = LANG_MAP[language ?? ""] ?? "markup";

  const html = useMemo(() => {
    try {
      const grammar = Prism.languages[prismLang] ?? Prism.languages.markup;
      return Prism.highlight(code, grammar, prismLang);
    } catch {
      return escapeHtml(code);
    }
  }, [code, prismLang]);

  return (
    <pre className={`max-h-[70vh] overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-relaxed ${className ?? ""}`}>
      <code
        className={`language-${prismLang}`}
        // Prism.highlight output is generated from source text with HTML-escaped tokens.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
