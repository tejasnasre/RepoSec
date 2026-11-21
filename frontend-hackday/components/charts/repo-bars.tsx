"use client";

import Link from "next/link";
import { ChartCard, ChartEmpty, Legend, SEVERITIES } from "@/components/charts/chart-kit";

export type RepoRow = { id: string; fullName: string; analyzed: boolean; totals: Record<string, number> | null };

/** Horizontal stacked bars built from divs: crisp text, native hover, keyboard-focusable links. */
export function RepoBars({ repositories }: { repositories: RepoRow[] }) {
  const rows = repositories
    .filter((r) => r.analyzed && r.totals)
    .map((r) => ({ ...r, t: r.totals as Record<string, number> }))
    .sort((a, b) => (b.t.vulnerabilities ?? 0) - (a.t.vulnerabilities ?? 0))
    .slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => SEVERITIES.reduce((n, s) => n + (r.t[s.key] ?? 0), 0)));
  return (
    <ChartCard title="Exposure by repository" description="Vulnerabilities per repository, split by severity.">
      {rows.length === 0 ? (
        <ChartEmpty>No analyzed repositories yet.</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const total = SEVERITIES.reduce((n, s) => n + (r.t[s.key] ?? 0), 0);
              return (
                <li key={r.id}>
                  <Link href={`/dashboard/repositories/${r.id}`} className="group block rounded-md outline-offset-4">
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium group-hover:underline">{r.fullName}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total} {total === 1 ? "issue" : "issues"}</span>
                    </div>
                    <div className="relative">
                      <div title={SEVERITIES.map((s) => `${s.label}: ${r.t[s.key] ?? 0}`).join(" · ")} className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]" style={{ width: `${Math.max(2, (total / max) * 100)}%` }} role="img" aria-label={`${r.fullName}: ${SEVERITIES.map((s) => `${r.t[s.key] ?? 0} ${s.key}`).join(", ")}`}>
                        {SEVERITIES.map((s) => (r.t[s.key] ?? 0) > 0 && <span key={s.key} style={{ flexGrow: r.t[s.key], background: s.color }} />)}
                        {total === 0 && <span className="grow bg-emerald-500/70" />}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Legend items={SEVERITIES.map((s) => ({ label: s.label, color: s.color }))} />
        </div>
      )}
    </ChartCard>
  );
}
