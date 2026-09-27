"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import type { AnalysisPayload, DiagramNode } from "@/types";

const LAYER_ORDER: Array<DiagramNode["layer"]> = ["client", "frontend", "backend", "data", "external"];

const LAYER_LABELS: Record<DiagramNode["layer"], string> = {
  client: "Client",
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  external: "External services",
};

export function ArchitectureTab({ payload }: { payload: AnalysisPayload }) {
  const diagram = payload.architectureDiagram;
  const failed = false;

  const byLayer = useMemo(() => {
    const map = new Map<DiagramNode["layer"], DiagramNode[]>();
    if (diagram) {
      for (const node of diagram.nodes) {
        const list = map.get(node.layer) ?? [];
        list.push(node);
        map.set(node.layer, list);
      }
    }
    return map;
  }, [diagram]);

  const asMermaid = useMemo(() => {
    if (!diagram) return "";
    const lines = ["graph TD"];
    for (const n of diagram.nodes) lines.push(`  ${n.id}["${n.label}"]`);
    for (const e of diagram.edges) {
      lines.push(e.label ? `  ${e.from} -->|${e.label}| ${e.to}` : `  ${e.from} --> ${e.to}`);
    }
    return lines.join("\n");
  }, [diagram]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Architecture</CardTitle>
          {diagram && !failed ? <CopyButton text={asMermaid} label="Copy Mermaid" /> : null}
        </CardHeader>
        <CardContent>
          {diagram && !failed && diagram.nodes.length > 0 ? (
            <div className="space-y-1">
              {LAYER_ORDER.map((layer) => {
                const nodes = byLayer.get(layer);
                if (!nodes || nodes.length === 0) return null;
                return (
                  <div key={layer}>
                    <div className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {LAYER_LABELS[layer]}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {nodes.map((n) => (
                        <div
                          key={n.id}
                          title={n.detail ?? undefined}
                          className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2"
                        >
                          <div className="text-sm font-medium">{n.label}</div>
                          {n.detail ? <code className="text-[11px] text-accent">{n.detail}</code> : null}
                        </div>
                      ))}
                    </div>
                    <div aria-hidden className="my-1 text-center text-[var(--text-muted)]">↓</div>
                  </div>
                );
              })}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                {diagram.edges
                  .filter((e) => e.label)
                  .map((e, i) => (
                    <span key={i}>
                      <code>{e.from}</code> → <code>{e.to}</code>: {e.label}
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              {failed || !diagram || diagram.nodes.length === 0
                ? "No structured diagram was generated for this repository. See the architecture explanation below."
                : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {payload.architecture ? (
        <Card>
          <CardHeader>
            <CardTitle>Explanation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{payload.architecture}</p>
          </CardContent>
        </Card>
      ) : null}

      {payload.directoryExplanation.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Directory map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {payload.directoryExplanation.map((d) => (
              <div key={d.path} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <code className="shrink-0 text-xs text-accent sm:w-56">{d.path}</code>
                <span className="text-sm text-[var(--text-secondary)]">{d.purpose}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
