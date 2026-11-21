"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, FileSearch, GitPullRequest, ScanSearch, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/badges";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { groupByDay, timeAgo, timeOfDay } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Ev = { at: string; type: "analysis" | "remediation" | "investigation"; repository: string; title: string; detail: string | null; status: string; link: string };

const kinds: Record<Ev["type"], { icon: LucideIcon; label: string }> = {
  analysis: { icon: ScanSearch, label: "Scan" },
  investigation: { icon: FileSearch, label: "Investigation" },
  remediation: { icon: GitPullRequest, label: "Remediation" },
};

const filters = [
  ["all", "All", () => true],
  ["analysis", "Scans", (e: Ev) => e.type === "analysis"],
  ["investigation", "Investigations", (e: Ev) => e.type === "investigation"],
  ["remediation", "Remediation", (e: Ev) => e.type === "remediation"],
  ["failed", "Failed", (e: Ev) => e.status === "failed"],
] as const;

const tone = (s: string) => (s === "completed" || s === "merged" ? "good" : s === "failed" ? "bad" : s === "closed" ? "neutral" : "info");

function Timeline({ events }: { events: Ev[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const active = filters.find((f) => f[0] === filter)!;
  const visible = events.filter(active[2]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div role="tablist" aria-label="Filter activity" className="inline-flex w-fit flex-wrap rounded-lg border bg-muted/50 p-0.5">
        {filters.map(([key, label, fn]) => {
          const n = events.filter(fn).length;
          if (key === "failed" && n === 0 && filter !== key) return null;
          return (
            <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${filter === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label} <span className="tabular-nums text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">Nothing matches this filter.</p>
      ) : (
        groupByDay(visible, (e) => e.at).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h2>
            <ol className="relative flex flex-col gap-1 before:absolute before:top-3 before:bottom-3 before:left-[19px] before:w-px before:bg-border">
              {g.items.map((e, i) => {
                const { icon: Icon, label } = kinds[e.type];
                return (
                  <li key={`${e.link}-${e.at}-${i}`} className="relative">
                    <Link href={e.link} className="flex items-start gap-3 rounded-lg p-2 pr-3 text-sm transition-colors hover:bg-muted/50">
                      <span className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background" title={label}>
                        <Icon className="size-3.5 text-muted-foreground" aria-label={label} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.title}</span>
                          <Pill t={tone(e.status)} className="capitalize">{e.status}</Pill>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.repository}{e.detail ? ` · ${e.detail}` : ""}</p>
                      </div>
                      <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="shrink-0 pt-0.5 text-xs text-muted-foreground">{timeAgo(e.at)} · {timeOfDay(e.at)}</time>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

export function ActivityView() {
  const query = useApi<{ events: Ev[] }>("/activity");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={6} />}>
      {({ events }) =>
        !events.length ? (
          <EmptyState icon={Activity} title="No activity yet" body="Analysis runs, push-triggered rescans and remediation events will show up here." />
        ) : (
          <Timeline events={events} />
        )
      }
    </QueryBoundary>
  );
}
