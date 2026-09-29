import type { Metadata } from "next";
import { BrainCircuit, FileCode2, KeyRound, Layers, MessageSquareCode, ScanSearch } from "lucide-react";
import { AnalyzeForm } from "@/components/analyze-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLink } from "@/components/logo";
import { AISettingsDialog } from "@/components/ai/ai-settings-gate";

export const metadata: Metadata = {
  title: "RepoTutor — Understand Any GitHub Codebase",
  description:
    "Turn any public GitHub repository into an interactive guide. Explore architecture, understand files, trace code flows, and chat with the codebase.",
};

const FEATURES = [
  { icon: ScanSearch, title: "Repository analysis", body: "Metadata, file tree, statistics, and tech stack from real evidence." },
  { icon: Layers, title: "Architecture understanding", body: "How the pieces fit, derived from actual code and file structure." },
  { icon: FileCode2, title: "File exploration", body: "Browse the real repository tree, open files, and get per-file explanations." },
  { icon: MessageSquareCode, title: "Codebase chat", body: "Ask questions and get answers that cite real file paths." },
  { icon: BrainCircuit, title: "Learning path", body: "A leveled reading plan generated from the analyzed repository." },
  { icon: KeyRound, title: "Bring your own key", body: "Optional: use your Groq or OpenRouter key. Session-only, never stored." },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <BrandLink />
        <nav aria-label="Main" className="flex items-center gap-3">
          <AISettingsDialog />
          <ThemeToggle />
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Understand any GitHub codebase.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Turn any public GitHub repository into an interactive guide. Explore architecture, understand files, trace code
          flows, and chat with the codebase.
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
        <span>RepoTutor — understand any public GitHub repository</span>
        <span className="font-mono">paste → analyze → understand</span>
      </footer>
    </main>
  );
}
