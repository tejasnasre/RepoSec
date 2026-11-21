"use client";

import { ShieldCheck } from "lucide-react";
import { Pill, SeverityBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { useApi } from "@/lib/use-api";

type V = { id: string; canonicalId: string; aliases: string[]; isMalicious: boolean; summary: string | null; severity: string; severitySource: string | null; cvssScore: number | null; cwes: string[]; sources: string[]; references: { url: string }[]; affectedPackages: string[]; repositories: string[] };

function List({ vulnerabilities }: { vulnerabilities: V[] }) {
  if (!vulnerabilities.length) return <EmptyState icon={ShieldCheck} title="No vulnerabilities recorded" body="None of your analyzed repositories currently match an advisory." />;
  return (
    <ul className="m-6 divide-y rounded-xl border">
      {vulnerabilities.map((v) => (
        <li key={v.id} className="p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={v.severity} />
            <span className="font-medium">{v.canonicalId}</span>
            {v.aliases.filter((a) => a !== v.canonicalId).slice(0, 3).map((a) => <span key={a} className="font-mono text-xs text-muted-foreground">{a}</span>)}
            {v.isMalicious && <Pill t="bad">Malicious package</Pill>}
            {v.cvssScore && <Pill>CVSS {v.cvssScore}</Pill>}
            {v.cwes.slice(0, 2).map((c) => <Pill key={c}>{c}</Pill>)}
          </div>
          <p className="mt-1">{v.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">Affects {v.affectedPackages.join(", ")} in {v.repositories.join(", ")} · via {v.sources.join(" + ")}{v.severitySource ? ` · severity: ${v.severitySource}` : ""}</p>
          <p className="mt-1 text-xs">{v.references.slice(0, 3).map((r) => <a key={r.url} className="mr-3 underline" href={r.url} target="_blank" rel="noreferrer">{new URL(r.url).hostname}</a>)}</p>
        </li>
      ))}
    </ul>
  );
}

export function VulnerabilitiesView() {
  const query = useApi<{ vulnerabilities: V[] }>("/security/vulnerabilities");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={5} />}>
      {({ vulnerabilities }) => <List vulnerabilities={vulnerabilities} />}
    </QueryBoundary>
  );
}
