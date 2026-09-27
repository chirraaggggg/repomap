"use client";

import { BookOpen, KeyRound, Layers, Package, Rocket, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import type { AnalysisPayload } from "@/types";

export function OverviewTab({ payload }: { payload: AnalysisPayload }) {
  const a = payload;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>What is this project?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p>{a.summary || "Not available."}</p>
            {a.problem ? (
              <div>
                <h4 className="mb-1 font-medium text-[var(--text)]">What problem does it solve?</h4>
                <p>{a.problem}</p>
              </div>
            ) : null}
            {a.audience ? (
              <div>
                <h4 className="mb-1 font-medium text-[var(--text)]">Who is it for?</h4>
                <p>{a.audience}</p>
              </div>
            ) : null}
            {a.howItWorks ? (
              <div>
                <h4 className="mb-1 font-medium text-[var(--text)]">How does it work?</h4>
                <p>{a.howItWorks}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {a.importantFiles.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Important files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.importantFiles.slice(0, 8).map((f) => (
                <div key={f.path} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate text-xs text-accent">{f.path}</code>
                    <Badge className="shrink-0 font-mono">{f.importance}</Badge>
                  </div>
                  {f.role ? <p className="mt-1.5 text-sm font-medium">{f.role}</p> : null}
                  {f.why ? <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{f.why}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {a.keyFlows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Key flows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {a.keyFlows.map((flow) => (
                <div key={flow.name}>
                  <h4 className="text-sm font-medium">{flow.name}</h4>
                  {flow.description ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{flow.description}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {flow.steps.map((step, i) => (
                      <span key={`${flow.name}-${i}`} className="flex items-center gap-1.5">
                        {i > 0 ? <span aria-hidden className="text-[var(--text-muted)]">→</span> : null}
                        <code className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px]">{step}</code>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4 text-accent" /> Tech stack</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {a.techStack.length > 0 ? (
              a.techStack.map((t) => (
                <Badge key={t.name} title={t.evidence}>
                  {t.name}
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">{t.category}</span>
                </Badge>
              ))
            ) : (
              <span className="text-sm text-[var(--text-muted)]">No technologies detected.</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repository statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Files", formatNumber(a.stats.totalFiles)],
                ["Analyzed files", formatNumber(a.stats.analyzedFiles)],
                ["Ignored files", formatNumber(a.stats.ignoredFiles)],
                ["Lines analyzed", formatNumber(a.stats.totalLines)],
                ["Estimated tokens", `~${formatNumber(a.stats.estimatedTokens)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="text-[var(--text-secondary)]">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-2">
              {a.stats.languages.map((l) => (
                <div key={l.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{l.name}</span>
                    <span className="font-mono text-[var(--text-secondary)]">{l.percentage}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, l.percentage)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {a.setupInstructions ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-accent" /> Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{a.setupInstructions}</p>
              {a.environmentVariables.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-xs font-medium text-[var(--text)]">
                    <KeyRound className="h-3 w-3" /> Environment variables
                  </h4>
                  {a.environmentVariables.map((v) => (
                    <div key={v.name} className="flex items-baseline justify-between gap-2 text-xs">
                      <code className="text-accent">{v.name}</code>
                      <span className="text-right text-[var(--text-secondary)]">{v.purpose}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {a.dependencies.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4 text-accent" /> Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {a.dependencies.map((d) => (
                  <Badge key={`${d.name}-${d.type}`} className="font-mono" title={`${d.type} · ${d.version || "version n/a"}`}>
                    {d.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {a.suggestedLearningPath.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-accent" /> Suggested learning path</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-secondary)]">
                {a.suggestedLearningPath.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        {a.database !== "" || a.authentication !== "" || a.api !== "" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="h-4 w-4 text-accent" /> Systems</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                ["Database", a.database],
                ["Authentication", a.authentication],
                ["API", a.api],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <h4 className="text-xs font-medium text-[var(--text)]">{k}</h4>
                    <p className="mt-0.5 text-[var(--text-secondary)]">{v}</p>
                  </div>
                ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
