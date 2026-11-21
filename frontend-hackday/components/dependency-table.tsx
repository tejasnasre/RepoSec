"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/badges";
import { apiFetch } from "@/lib/api";
import type { Dependency } from "@/lib/types";

const scopes = [
  ["", "All"], ["direct", "Direct"], ["transitive", "Transitive"], ["dev", "Dev"], ["outdated", "Outdated"], ["vulnerable", "Vulnerable"],
] as const;

type Res = { total: number; page: number; pageSize: number; dependencies: Dependency[] };

export function DependencyTable({ repositoryId }: { repositoryId: string }) {
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data?: Res; error?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ page: String(page), pageSize: "40" });
  if (scope) params.set("scope", scope);
  if (debounced) params.set("q", debounced);
  const key = `${repositoryId}?${params}`;

  useEffect(() => {
    let cancelled = false;
    apiFetch<Res>(`/repositories/${repositoryId}/dependencies?${key.split("?")[1]}`)
      .then((r) => !cancelled && setResult({ key, data: r }))
      .catch(() => !cancelled && setResult({ key, error: "Couldn't load the dependency inventory." }));
    return () => { cancelled = true; };
  }, [repositoryId, key]);

  // Stale results (for a previous filter) render as loading skeletons.
  const current = result?.key === key ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-2">
        {scopes.map(([value, label]) => (
          <Button key={value} size="sm" variant={scope === value ? "default" : "outline"} onClick={() => { setScope(value); setPage(1); }}>{label}</Button>
        ))}
        <Input className="ml-auto w-56" placeholder="Search packages…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search packages" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-3">Package</th><th className="p-3">Installed</th><th className="p-3">Declared</th><th className="p-3">Latest stable</th><th className="p-3">Type</th><th className="p-3">Path</th></tr>
          </thead>
          <tbody className="divide-y">
            {!data && Array.from({ length: 8 }, (_, i) => (
              <tr key={i}>{Array.from({ length: 6 }, (_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full max-w-32" /></td>)}</tr>
            ))}
            {data?.dependencies.map((d) => (
              <tr key={d.id}>
                <td className="p-3 font-medium">
                  {d.name}
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {d.hasVulnerability && <Pill t="bad">Vulnerable</Pill>}
                    {d.isDeprecated && <Pill t="warn">Deprecated</Pill>}
                    {d.isOutdated && !d.hasVulnerability && <Pill>Outdated</Pill>}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs">{d.installedVersion ?? "unknown"}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{d.declaredRange ?? "—"}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{d.latestStableVersion ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground">{[d.isDirect ? "direct" : "transitive", d.isDev && "dev", d.isPeer && "peer", d.isOptional && "optional"].filter(Boolean).join(", ")}</td>
                <td className="max-w-64 truncate p-3 text-xs text-muted-foreground" title={d.dependencyPath.join(" › ")}>{d.dependencyPath.length > 1 ? d.dependencyPath.join(" › ") : "—"}</td>
              </tr>
            ))}
            {data && data.dependencies.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No packages match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} packages</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span>Page {page} of {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
