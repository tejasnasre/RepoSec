"use client";

import Link from "next/link";
import { FileSearch } from "lucide-react";
import { Pill } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { shortSha, timeAgo } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Row = { id: string; repository: string; package: string; installedVersion: string; commitSha: string | null; status: string; priority: string | null; summary: string | null; createdAt: string; error: string | null };

export function InvestigationsView() {
  const query = useApi<{ investigations: Row[] }>("/security/investigations");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={4} />}>
      {({ investigations }) =>
        !investigations.length ? (
          <EmptyState icon={FileSearch} title="No investigations yet" body="When an analysis finds a vulnerable package, Gemini researches the official fix, changelog and migration path and the report appears here." />
        ) : (
          <ul className="m-6 divide-y rounded-xl border">
            {investigations.map((i) => (
              <li key={i.id}>
                <Link href={`/dashboard/investigations/${i.id}`} className="block p-4 hover:bg-muted/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.package}@{i.installedVersion}</span>
                    {i.priority && <Pill t={i.priority === "critical" ? "bad" : i.priority === "high" ? "warn" : "neutral"} className="capitalize">{i.priority} priority</Pill>}
                    <Pill t={i.status === "completed" ? "good" : i.status === "failed" ? "bad" : "info"} className="capitalize">{i.status}</Pill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.summary ?? i.error ?? "In progress…"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{i.repository} · commit <span className="font-mono">{shortSha(i.commitSha)}</span> · {timeAgo(i.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </QueryBoundary>
  );
}
