"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FolderGit2, GitBranch } from "lucide-react";
import { AnalysisStatusBadge, SeverityBadge } from "@/components/badges";
import { AvailableRepositories } from "@/components/available-repositories";
import { EmptyState } from "@/components/empty-state";
import { GitHubInstallLink } from "@/components/github-install-link";
import { GitHubStatusNotice } from "@/components/github-status-notice";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { shortSha, timeAgo } from "@/lib/format";
import type { Installation, Repository } from "@/lib/github-types";
import type { ConnectedRepository } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function RepositoriesView() {
  const sp = useSearchParams();
  const installationsQ = useApi<{ installations: Installation[] }>("/github/installations");
  const allQ = useApi<{ repositories: Repository[] }>("/github/repositories");
  const connectedQ = useApi<{ repositories: ConnectedRepository[] }>("/repositories");

  const queries = [installationsQ, allQ, connectedQ];
  const failed = queries.find((q) => q.isError && q.data === undefined);
  const combined = {
    data: queries.every((q) => q.data !== undefined) ? true : undefined,
    isError: !!failed,
    error: failed?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };

  return (
    <QueryBoundary query={combined} skeleton={<RepositoryListSkeleton />}>
      {() => {
        const installations = installationsQ.data!.installations;
        const all = allQ.data!.repositories;
        const connected = connectedQ.data!.repositories;
        const available = all.filter((r) => !r.connected);
        return (
    <>
      <GitHubStatusNotice status={sp.get("github") ?? undefined} reason={sp.get("reason") ?? undefined} />
      {installations.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="Connect your GitHub repositories"
          body="Install the RepoSec GitHub App and choose which repositories it can see. It can read code and manifests, read CI results, and open pull requests on a branch. It never pushes to your default branch and never merges."
          action={<GitHubInstallLink>Install GitHub App</GitHubInstallLink>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-2">
            <p className="text-sm text-muted-foreground">Installed on {installations.map((i) => `@${i.accountLogin}`).join(", ")}</p>
            <GitHubInstallLink variant="outline">Add or remove repositories on GitHub</GitHubInstallLink>
          </div>

          {connected.length > 0 && (
            <section className="px-6 py-4">
              <h2 className="mb-3 text-sm font-medium">Connected ({connected.length})</h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {connected.map((r) => (
                  <li key={r.id}>
                    <Link href={`/dashboard/repositories/${r.id}`} className="block rounded-xl border p-4 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-medium">{r.fullName}</span>
                        {r.analysis ? <AnalysisStatusBadge status={r.analysis.status} /> : <AnalysisStatusBadge status="queued" />}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="size-3" aria-hidden="true" /> {r.defaultBranch} · analyzed <span className="font-mono">{shortSha(r.lastAnalyzedCommit)}</span> · {timeAgo(r.analysis?.completedAt ?? r.analysis?.createdAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {r.totals ? (
                          <>
                            <span className="text-muted-foreground">{r.totals.dependencies} deps</span>
                            {r.totals.critical > 0 && <SeverityBadge severity="critical" count={r.totals.critical} />}
                            {r.totals.high > 0 && <SeverityBadge severity="high" count={r.totals.high} />}
                            <span className={r.totals.vulnerabilities ? "font-medium" : "text-muted-foreground"}>{r.totals.vulnerabilities} vulnerabilities</span>
                            <span className="text-muted-foreground">· {r.totals.outdated} outdated</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">No completed analysis yet</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {all.length === 0 ? (
            <EmptyState icon={FolderGit2} title="No repositories shared yet" body="The app is installed but has no repositories selected. Choose some on GitHub, then refresh." />
          ) : (
            <AvailableRepositories repositories={available} />
          )}
        </>
      )}
    </>
        );
      }}
    </QueryBoundary>
  );
}
