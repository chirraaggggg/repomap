"use client";

import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisPayload, LearningStep } from "@/types";

interface Props {
  payload: AnalysisPayload;
  /** Opens a file in the existing Files tab viewer. */
  onOpenFile?: (path: string) => void;
}

/**
 * Learning roadmap rendered from the existing analysis payload
 * (`learningPath`, falling back to `suggestedLearningPath`) —
 * no extra AI call; the analysis already generated this.
 */
export function LearnTab({ payload, onOpenFile }: Props) {
  const steps: LearningStep[] = (payload.learningPath ?? []).map((level) => ({
    title: level.title,
    description: level.goal,
    files: level.files,
  }));
  const suggested = payload.suggestedLearningPath ?? [];

  if (steps.length === 0 && suggested.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--text-secondary)]">
          No learning path was generated for this repository.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">Learn this repository</h2>
      </div>

      {steps.length > 0 ? (
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <Card key={`${step.title}-${index}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft font-mono text-xs text-accent">
                    {index + 1}
                  </span>
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {step.description ? (
                  <p className="text-sm text-[var(--text-secondary)]">{step.description}</p>
                ) : null}
                {step.files.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {step.files.map((file, fileIndex) =>
                      onOpenFile ? (
                        <button
                          key={`${file}-${fileIndex}`}
                          type="button"
                          onClick={() => onOpenFile(file)}
                          title={`Open ${file} in Files`}
                          className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-accent hover:underline"
                        >
                          {file}
                        </button>
                      ) : (
                        <code
                          key={`${file}-${fileIndex}`}
                          className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-accent"
                        >
                          {file}
                        </code>
                      ),
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </ol>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Suggested path</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-secondary)]">
              {suggested.map((s, i) => (
                <li key={`${s}-${i}`}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Generated from this repository&apos;s analysis. Click a file path to open it in the Files tab.
      </p>
    </div>
  );
}
