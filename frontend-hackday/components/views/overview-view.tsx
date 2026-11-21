"use client";

import Link from "next/link";
import { AlertOctagon, Boxes, FolderGit2, Hourglass, ShieldAlert, type LucideIcon } from "lucide-react";
import { Pill } from "@/components/badges";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { RepoBars, type RepoRow } from "@/components/charts/repo-bars";
import { SeverityDonut } from "@/components/charts/severity-donut";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/empty-state";
import { QueryBoundary } from "@/components/query-boundary";
import { OverviewSkeleton } from "@/components/skeletons";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Overview = {
  totals: {
    connectedRepositories: number; dependencies: number; direct: number; vulnerabilities: number; critical: number; high: number; medium: number; low: number;
    malicious: number; outdated: number; deprecated: number; openRemediationPrs: number;
  };
  repositories: RepoRow[];
  recentInvestigations: { id: string; package: string; version: string; status: string; priority: string | null; createdAt: string }[];
  trend: TrendPoint[];
  remediation: Record<string, number>;
};

function Kpi({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: number; note?: string; tone?: "bad" | "muted" }) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${value === 0 ? "text-muted-foreground" : tone === "bad" ? "text-destructive" : ""}`}>{value.toLocaleString()}</div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Card>
  );
}

/**
 * Security totals only count confirmed advisories. "Outdated" is its own measure and is never
 * added to vulnerability counts.
 */
export function OverviewView() {
  const query = useApi<Overview>("/overview");
  return (
    <QueryBoundary query={query} skeleton={<OverviewSkeleton />}>
      {({ totals: t, repositories, recentInvestigations, trend, remediation }) => {
        const anyAnalyzed = repositories.some((r) => r.analyzed);
        const transitive = Math.max(0, t.dependencies - t.direct);
        const prTotal = Object.values(remediation).reduce((n, v) => n + v, 0);
        return (
          <div className="flex flex-col gap-6 p-6">
            {t.connectedRepositories === 0 && (
              <EmptyState icon={FolderGit2} title="No repositories connected yet" body="Connect a GitHub repository and we'll analyze its dependencies, check them against OSV, GitHub Advisories and NVD, and investigate anything that affects you."
                action={<Link href="/dashboard/repositories" className={buttonVariants()}>Connect a repository</Link>} />
            )}
            {t.connectedRepositories > 0 && !anyAnalyzed && (
              <EmptyState icon={Hourglass} title="First analysis in progress" body="Repositories are connected; results appear as soon as the worker finishes the first scan. Open a repository to watch real progress."
                action={<Link href="/dashboard/repositories" className={buttonVariants({ variant: "outline" })}>View repositories</Link>} />
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icon={FolderGit2} label="Repositories" value={t.connectedRepositories} note="Connected" />
              <Kpi icon={Boxes} label="Dependencies" value={t.dependencies} note={`${t.direct.toLocaleString()} direct · ${transitive.toLocaleString()} transitive`} />
              <Kpi icon={ShieldAlert} label="Vulnerabilities" value={t.vulnerabilities} tone="bad" note="Confirmed advisories only" />
              <Kpi icon={AlertOctagon} label="Critical & high" value={t.critical + t.high} tone="bad" note={t.malicious > 0 ? `${t.malicious} malicious package alert${t.malicious === 1 ? "" : "s"}` : "No malicious packages"} />
            </div>

            {anyAnalyzed && (
              <div className="grid gap-4 lg:grid-cols-2">
                <SeverityDonut counts={t} />
                <RepoBars repositories={repositories} />
                <TrendChart trend={trend} />
                <BreakdownBars
                  title="Dependency health"
                  description="Share of all dependencies. Outdated is not a security total."
                  total={t.dependencies}
                  empty="No dependencies analyzed yet."
                  items={[
                    { label: "Direct", value: t.direct, color: "var(--chart-2)" },
                    { label: "Transitive", value: transitive, color: "var(--chart-3)" },
                    { label: "Outdated", value: t.outdated, color: "var(--chart-4)" },
                    { label: "Deprecated", value: t.deprecated, color: "#f97316" },
                  ]}
                />
                <BreakdownBars
                  title="Remediation pull requests"
                  description="Fixes RepoSec has opened for you."
                  total={prTotal}
                  empty="No remediation PRs yet. Open an investigation and choose “Create pull request”."
                  items={[
                    { label: "Open", value: remediation.open ?? 0, color: "#0ea5e9" },
                    { label: "Merged", value: remediation.merged ?? 0, color: "#059669" },
                    { label: "Closed", value: remediation.closed ?? 0, color: "#a3a3a3" },
                    { label: "Failed", value: remediation.failed ?? 0, color: "#dc2626" },
                  ]}
                />
              </div>
            )}

            {recentInvestigations.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium">Recent investigations</h2>
                  <Link href="/dashboard/investigations" className="text-xs text-muted-foreground underline-offset-4 hover:underline">View all</Link>
                </div>
                <ul className="divide-y rounded-xl border">
                  {recentInvestigations.map((i) => (
                    <li key={i.id}><Link href={`/dashboard/investigations/${i.id}`} className="flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-muted/40">
                      <span className="font-medium">{i.package}@{i.version}</span>
                      {i.priority && <Pill t={i.priority === "critical" ? "bad" : i.priority === "high" ? "warn" : "neutral"} className="capitalize">{i.priority}</Pill>}
                      <Pill t={i.status === "completed" ? "good" : i.status === "failed" ? "bad" : "info"} className="capitalize">{i.status}</Pill>
                      <span className="ml-auto text-xs text-muted-foreground">{timeAgo(i.createdAt)}</span>
                    </Link></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
