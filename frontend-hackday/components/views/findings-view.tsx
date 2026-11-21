"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FindingList } from "@/components/finding-list";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import type { Finding } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const severities = ["", "critical", "high", "medium", "low"];

/** Fetches every finding once (cached) and filters in the browser, so switching the severity chip is instant. */
export function FindingsView() {
  const severity = useSearchParams().get("severity") ?? "";
  const query = useApi<{ findings: Finding[] }>("/security/findings");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={6} />}>
      {({ findings }) => {
        const visible = severity ? findings.filter((f) => f.severity === severity) : findings;
        const security = visible.filter((f) => f.classification !== "deprecated_package");
        const deprecated = visible.filter((f) => f.classification === "deprecated_package");
        const count = (s: string) => (s ? findings.filter((f) => f.severity === s && f.classification !== "deprecated_package").length : findings.filter((f) => f.classification !== "deprecated_package").length);
        return (
          <>
            <div className="flex flex-wrap items-center gap-2 px-6 pt-6">
              {severities.map((s) => (
                <Link key={s} href={s ? `/dashboard/findings?severity=${s}` : "/dashboard/findings"} replace
                  className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${severity === s ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                  {s || "All severities"} <span className="tabular-nums opacity-70">{count(s)}</span>
                </Link>
              ))}
            </div>
            {security.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No findings" body="Nothing matches. Connect a repository and wait for its analysis to finish, or clear the filter." />
            ) : (
              <FindingList findings={security} />
            )}
            {deprecated.length > 0 && !severity && (
              <>
                <h2 className="px-6 text-sm font-medium">Deprecated packages ({deprecated.length})</h2>
                <FindingList findings={deprecated} />
              </>
            )}
          </>
        );
      }}
    </QueryBoundary>
  );
}
