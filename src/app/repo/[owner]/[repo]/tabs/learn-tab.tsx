"use client";

import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisPayload } from "@/types";

export function LearnTab({ payload }: { payload: AnalysisPayload }) {
  const levels = payload.learningPath ?? [];
  const suggested = payload.suggestedLearningPath ?? [];

  if (levels.length === 0 && suggested.length === 0) {
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

      {levels.length > 0 ? (
        <ol className="space-y-3">
          {levels.map((level) => (
            <Card key={level.level}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft font-mono text-xs text-accent">
                    {level.level}
                  </span>
                  {level.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {level.goal ? <p className="text-sm text-[var(--text-secondary)]">{level.goal}</p> : null}
                {level.files.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {level.files.map((f) => (
                      <code key={f} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-accent">
                        {f}
                      </code>
                    ))}
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
                <li key={i}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
