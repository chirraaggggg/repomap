import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, FileCode2, GitBranch, Layers, MessageSquareCode, ScanSearch } from "lucide-react";
import { AnalyzeForm } from "@/components/analyze-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Repomap — Understand any GitHub codebase",
  description:
    "Paste a GitHub repository and turn it into structured AI-ready context you can understand, explore, and chat with.",
};

const FEATURES = [
  { icon: ScanSearch, title: "Repository analysis", body: "Metadata, file tree, statistics, and tech stack from real evidence." },
  { icon: BrainCircuit, title: "AI-ready prompts", body: "Copy a clean master prompt for ChatGPT, Claude, Gemini, or Cursor." },
  { icon: Layers, title: "Architecture understanding", body: "How the pieces fit, derived from actual code and file structure." },
  { icon: MessageSquareCode, title: "Codebase chat", body: "Ask questions and get answers that cite real file paths." },
  { icon: FileCode2, title: "Important files", body: "Where to start reading, and why each file matters." },
  { icon: GitBranch, title: "No setup required", body: "Public repositories work immediately — paste a URL and go." },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-xs font-bold text-white">R</span>
          repomap
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Understand any GitHub codebase.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Paste a GitHub repository and turn it into structured AI-ready context you can understand, explore, and chat with.
        </p>

        <div className="mt-10 flex w-full justify-center">
          <AnalyzeForm />
        </div>

        <div className="mt-14 flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          {["Paste", "Analyze", "Understand"].map((label, i) => (
            <div key={label} className="flex items-center gap-4 sm:gap-8">
              {i > 0 ? <span aria-hidden className="hidden h-px w-10 bg-[var(--border-strong)] sm:block" /> : null}
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-strong)] font-mono text-xs text-[var(--text-secondary)]">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Features" className="border-t border-[var(--border)] py-14">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-2">
              <Icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-[var(--border)] py-6 text-xs text-[var(--text-muted)]">
        <span>repomap — analyze any public GitHub repository</span>
        <span className="font-mono">paste → analyze → understand</span>
      </footer>
    </main>
  );
}
