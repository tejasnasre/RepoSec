"use client";

import { useEffect, useRef, useState } from "react";
import { useRefreshAll } from "@/lib/use-api";
import { CheckCircle2, Circle, CircleAlert, MinusCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { stageLabels } from "@/lib/format";
import type { Analysis, Stage } from "@/lib/types";

type Snapshot = { analysis: Analysis | null; stages: Stage[]; job: { status: string; attempts: number; lastError: string | null } | null };

/** Polls real stage states from the worker (no fake percentages). Refreshes the page when the run finishes. */
export function AnalysisProgress({ repositoryId, initial }: { repositoryId: string; initial: Snapshot }) {
  const refreshAll = useRefreshAll();
  const [snap, setSnap] = useState<Snapshot>(initial);
  const wasActive = useRef(initial.analysis?.status === "queued" || initial.analysis?.status === "running");
  const status = snap.analysis?.status;
  const active = status === "queued" || status === "running";

  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      try {
        const next = await apiFetch<Snapshot>(`/repositories/${repositoryId}/analyses/latest`);
        setSnap(next);
        if (next.analysis && next.analysis.status !== "queued" && next.analysis.status !== "running") {
          clearInterval(id);
          if (wasActive.current) refreshAll();
        }
      } catch {
        /* transient: keep polling */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active, repositoryId, refreshAll]);

  if (!snap.analysis || (!active && status !== "failed")) return null;

  return (
    <section aria-live="polite" className="mx-6 mt-6 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        {active ? <Spinner /> : <CircleAlert className="size-4 text-destructive" />}
        <h2 className="font-medium">{status === "queued" ? "Waiting for the worker…" : status === "running" ? "Analysis in progress" : "Analysis failed"}</h2>
      </div>
      {status === "queued" && (
        <p className="mt-1 text-sm text-muted-foreground">The job is queued. Make sure the worker is running (<code className="font-mono">bun run worker</code>).</p>
      )}
      {status === "failed" && (
        <p className="mt-1 text-sm text-destructive">{snap.analysis.error ?? snap.job?.lastError ?? "Unknown error"}{snap.job && snap.job.status === "queued" ? " — retrying automatically." : ""}</p>
      )}
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {snap.stages.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">
              {s.status === "succeeded" ? <CheckCircle2 className="size-4 text-emerald-600" /> : s.status === "running" ? <Spinner /> : s.status === "failed" ? <CircleAlert className="size-4 text-destructive" /> : s.status === "skipped" ? <MinusCircle className="size-4 text-muted-foreground" /> : <Circle className="size-4 text-muted-foreground/50" />}
            </span>
            <span className={s.status === "pending" ? "text-muted-foreground" : ""}>
              {stageLabels[s.name] ?? s.name}
              {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
