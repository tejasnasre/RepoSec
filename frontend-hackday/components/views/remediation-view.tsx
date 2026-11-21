"use client";

import { GitPullRequest } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/badges";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { timeAgo } from "@/lib/format";
import type { PullRequestRow } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const verif = {
  pending: ["Awaiting merge", "neutral"], fix_verified: ["Fix verified", "good"], fix_partially_verified: ["Partially verified", "warn"], still_vulnerable: ["Still vulnerable", "bad"],
} as const;

function List({ pullRequests }: { pullRequests: PullRequestRow[] }) {
  if (!pullRequests.length) return <EmptyState icon={GitPullRequest} title="No remediation pull requests" body="Open an investigation report and choose “Create pull request”. Nothing is ever merged automatically; after you merge, the resulting lockfile is re-analyzed to verify the fix." />;
  return (
    <ul className="m-6 flex flex-col gap-3">
      {pullRequests.map((p) => {
        const [vl, vt] = verif[p.verification];
        return (
          <li key={p.id} className="rounded-xl border p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.package} {p.from} → {p.to}</span>
              {p.prUrl ? <a className="underline" href={p.prUrl} target="_blank" rel="noreferrer">PR #{p.prNumber}</a> : null}
              <Pill t={p.state === "merged" ? "good" : p.state === "failed" ? "bad" : "info"} className="capitalize">{p.state}</Pill>
              <span className="text-xs text-muted-foreground">{p.repository} · {timeAgo(p.createdAt)}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Security verification</p><p className="mt-1"><Pill t={vt}>{vl}</Pill></p>
                {p.verificationDetail && <p className="mt-1 text-xs text-muted-foreground">{(p.verificationDetail as { originalVersionStillResolved?: boolean }).originalVersionStillResolved ? "Original version still resolves." : "Original version no longer resolves."}</p>}</div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">CI (GitHub Actions)</p>
                {p.ci.total === 0 ? <p className="mt-1 text-muted-foreground">No runs reported yet</p> : <p className="mt-1">{p.ci.passed} passed · <span className={p.ci.failed ? "text-destructive" : ""}>{p.ci.failed} failed</span> · {p.ci.pending} pending</p>}
                <ul className="mt-1 space-y-0.5 text-xs">{p.ci.runs.slice(0, 5).map((r, i) => <li key={i}>{r.url ? <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}: {r.conclusion ?? r.status}</li>)}</ul></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Validation by RepoSec</p><p className="mt-1"><Pill t="warn">Not run</Pill></p><p className="mt-1 text-xs text-muted-foreground">Repository code is never executed on our servers. Lockfile regeneration and tests happen in your CI.</p></div>
            </div>
            {p.error && <p className="mt-2 text-destructive">{p.error}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function RemediationView() {
  const query = useApi<{ pullRequests: PullRequestRow[] }>("/remediation");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={3} />}>
      {({ pullRequests }) => <List pullRequests={pullRequests} />}
    </QueryBoundary>
  );
}
