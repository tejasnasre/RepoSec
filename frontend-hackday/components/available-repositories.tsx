"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useRefreshAll } from "@/lib/use-api";
import { Lock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError, apiFetch } from "@/lib/api";
import type { Repository } from "@/lib/github-types";

/** Repos the GitHub App can see but the user has not connected yet. Connecting starts a background analysis. */
export function AvailableRepositories({ repositories }: { repositories: Repository[] }) {
  const router = useRouter();
  const refreshAll = useRefreshAll();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const run = (kind: "connect" | "sync", action: () => Promise<{ connected?: string[] } | unknown>) => {
    setError(null);
    setBusy(kind);
    start(async () => {
      try {
        const res = (await action()) as { connected?: string[] };
        if (kind === "connect" && res?.connected?.length === 1) { refreshAll(); router.push(`/dashboard/repositories/${res.connected[0]}`); }
        else refreshAll();
        setSelected(new Set());
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 px-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Available to connect ({repositories.length})</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run("sync", () => apiFetch("/github/sync", { method: "POST" }))}>
            {busy === "sync" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            {busy === "sync" ? "Refreshing…" : "Refresh from GitHub"}
          </Button>
          <Button size="sm" disabled={pending || selected.size === 0} onClick={() => run("connect", () => apiFetch("/repositories/connect", { method: "POST", body: JSON.stringify({ repositoryIds: [...selected] }) }))}>
            {busy === "connect" && <Spinner data-icon="inline-start" />}
            {busy === "connect" ? "Connecting…" : `Connect selected${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {repositories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">All repositories shared with the app are connected.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {repositories.map((repo) => (
            <li key={repo.id}>
              <label className="flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40">
                <input type="checkbox" className="size-4 accent-foreground" checked={selected.has(repo.id)} onChange={() => toggle(repo.id)} aria-label={`Select ${repo.fullName}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{repo.fullName}</span>
                    <Badge variant="outline" className="gap-1">{repo.isPrivate && <Lock className="size-3" aria-hidden="true" />}{repo.isPrivate ? "Private" : "Public"}</Badge>
                    {repo.archived && <Badge variant="secondary">Archived</Badge>}
                  </div>
                  {repo.description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{repo.description}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{repo.primaryLanguage ?? "Unknown language"} · default branch <span className="font-mono">{repo.defaultBranch}</span></p>
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
