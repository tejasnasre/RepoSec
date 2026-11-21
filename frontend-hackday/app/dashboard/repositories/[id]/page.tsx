import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, GitBranch } from "lucide-react";
import { AnalysisProgress } from "@/components/analysis-progress";
import { AnalysisStatusBadge } from "@/components/badges";
import { DependencyTable } from "@/components/dependency-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FindingList } from "@/components/finding-list";
import { RescanButton } from "@/components/rescan-button";
import { StatGridSkeleton } from "@/components/skeletons";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiRequestError } from "@/lib/api";
import { serverApi } from "@/lib/api-server";
import { shortSha, timeAgo } from "@/lib/format";
import type { Repository } from "@/lib/github-types";
import type { Analysis, Finding, Stage } from "@/lib/types";
import { ShieldCheck } from "lucide-react";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export default function RepositoryDetailPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<><PageHeader title="Repository" /><StatGridSkeleton count={4} /></>}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const tabs = [["overview", "Findings"], ["dependencies", "Dependencies"], ["history", "History"]] as const;

async function Content({ params, searchParams }: Props) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  let detail;
  try {
    detail = await serverApi<{
      repository: Repository & { connected: boolean };
      latestCommit: { sha: string; message: string | null } | null;
      analysis: Analysis | null; lastCompletedAnalysis: Analysis | null; totals: Analysis["totals"] | null;
    }>(`/repositories/${id}`);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const { repository: repo, analysis, lastCompletedAnalysis: done, latestCommit } = detail;
  const progress = await serverApi<{ analysis: Analysis | null; stages: Stage[]; job: { status: string; attempts: number; lastError: string | null } | null }>(`/repositories/${id}/analyses/latest`);
  const active = analysis?.status === "queued" || analysis?.status === "running";
  const totals = (done?.totals ?? {}) as Partial<Analysis["totals"]>;

  return (
    <>
      <PageHeader title={repo.fullName} description={repo.description ?? undefined} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1"><GitBranch className="size-3.5" aria-hidden="true" />{repo.defaultBranch}</span>
          <span>latest <span className="font-mono">{shortSha(latestCommit?.sha)}</span></span>
          <span>analyzed <span className="font-mono">{shortSha(done?.commitSha)}</span> · {timeAgo(done?.completedAt)}</span>
          {analysis && <AnalysisStatusBadge status={analysis.status} />}
          <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">GitHub <ExternalLink className="size-3" aria-hidden="true" /></a>
        </div>
        <RescanButton repositoryId={id} disabled={active} />
      </div>

      <AnalysisProgress repositoryId={id} initial={progress} />

      {!done ? (
        !active && <EmptyState icon={ShieldCheck} title="No completed analysis yet" body="Run a scan to build the dependency inventory and check it against advisory databases." />
      ) : (
        <>
          <div className="grid gap-4 px-6 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Dependencies", totals.dependencies ?? 0, `${totals.direct ?? 0} direct`],
              ["Vulnerabilities", totals.vulnerabilities ?? 0, `${totals.critical ?? 0} critical · ${totals.high ?? 0} high`],
              ["Malicious alerts", totals.malicious ?? 0, ""],
              ["Outdated", totals.outdated ?? 0, "not a security total"],
            ].map(([label, value, note]) => (
              <Card key={String(label)} size="sm">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className={`text-3xl tabular-nums ${value === 0 ? "text-muted-foreground" : ""}`}>{value}</CardTitle>
                  {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </CardHeader>
              </Card>
            ))}
          </div>

          <nav className="mt-6 flex gap-1 border-b px-6" aria-label="Repository sections">
            {tabs.map(([key, label]) => (
              <Link key={key} href={`/dashboard/repositories/${id}?tab=${key}`} aria-current={tab === key ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {label}
              </Link>
            ))}
          </nav>

          {tab === "dependencies" && <DependencyTable repositoryId={id} />}
          {tab === "history" && <History repositoryId={id} />}
          {tab === "overview" && <RepoFindings repositoryId={id} />}
        </>
      )}
    </>
  );
}

async function RepoFindings({ repositoryId }: { repositoryId: string }) {
  const { findings } = await serverApi<{ findings: Finding[] }>(`/security/findings?repositoryId=${repositoryId}`);
  if (!findings.length)
    return <EmptyState icon={ShieldCheck} title="No known vulnerabilities" body="No advisory in OSV, GitHub Advisories or NVD matches the resolved versions at the analyzed commit. This is not a guarantee: unknown or unpublished issues are not covered." />;
  return <FindingList findings={findings} />;
}

async function History({ repositoryId }: { repositoryId: string }) {
  const { analyses } = await serverApi<{ analyses: Analysis[] }>(`/repositories/${repositoryId}/analyses`);
  return (
    <ul className="m-6 divide-y rounded-xl border">
      {analyses.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <AnalysisStatusBadge status={a.status} />
          <span className="font-mono">{shortSha(a.commitSha)}</span>
          <span className="text-muted-foreground">{a.trigger.replace("_", " ")} · {timeAgo(a.completedAt ?? a.createdAt)}</span>
          {a.status === "completed" && (a.totals as { vulnerabilities?: number }).vulnerabilities !== undefined && <span className="text-muted-foreground">{(a.totals as { vulnerabilities: number }).vulnerabilities} vulnerabilities · {(a.totals as { dependencies: number }).dependencies} dependencies</span>}
          {a.error && <span className="truncate text-destructive">{a.error}</span>}
        </li>
      ))}
    </ul>
  );
}
