"use client";

import { useState } from "react";
import { useRefreshAll } from "@/lib/use-api";
import { Check, ClipboardCopy, GitPullRequest } from "lucide-react";
import { Pill } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError, apiFetch } from "@/lib/api";

type Pr = { id: string; prNumber: number | null; prUrl: string | null; state: string; verification: string; branch: string };

export function RemediationActions({ planId, pkg, from, to, pullRequests }: { planId: string; pkg: string; from: string; to: string | null; pullRequests: Pr[] }) {
  const refreshAll = useRefreshAll();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openPr = pullRequests.find((p) => p.state === "open" || p.state === "creating");

  async function copyPrompt() {
    setCopying(true);
    setError(null);
    try {
      const { prompt: text } = await apiFetch<{ prompt: string }>(`/remediation/${planId}/generate-prompt`, { method: "POST" });
      setPrompt(text);
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked: the text is shown below */ }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't generate the prompt");
    } finally { setCopying(false); }
  }

  async function createPr() {
    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/remediation/${planId}/create-pr`, { method: "POST" });
      setConfirm(false);
      refreshAll();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't create the pull request");
    } finally { setCreating(false); }
  }

  return (
    <section className="rounded-xl border p-4" aria-labelledby="remediate">
      <h2 id="remediate" className="font-medium">Fix this</h2>
      <p className="mt-1 text-sm text-muted-foreground">Update <span className="font-mono">{pkg}</span> {from} → <span className="font-mono">{to ?? "unknown"}</span>. Choose how:</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium"><GitPullRequest className="size-4" aria-hidden="true" />Create GitHub pull request</h3>
          <p className="mt-1 text-xs text-muted-foreground">Opens a branch and PR with the manifest change and a full explanation. Never pushes to your default branch, never merges. You review and merge.</p>
          {openPr ? (
            <p className="mt-3 text-sm">PR <a className="underline" href={openPr.prUrl ?? "#"} target="_blank" rel="noreferrer">#{openPr.prNumber}</a> is open <Pill className="ml-1">{openPr.state}</Pill></p>
          ) : !confirm ? (
            <Button className="mt-3" size="sm" disabled={!to} onClick={() => setConfirm(true)}>Create pull request…</Button>
          ) : (
            <div className="mt-3 space-y-2 rounded-md bg-muted p-3 text-xs">
              <p className="font-medium">This will:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>create branch <span className="font-mono">security/SEC-…-{pkg.replace(/^@/, "").replace(/\//g, "-")}</span> from the default branch</li>
                <li>change the manifest to require {pkg} {to}</li>
                <li>open a PR linking this report</li>
              </ul>
              <p className="text-muted-foreground">The lockfile is not regenerated and tests are not run by RepoSec (repository code is never executed on our servers). Your CI will run on the PR.</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={createPr} disabled={creating}>{creating && <Spinner data-icon="inline-start" />}{creating ? "Creating…" : "Confirm and create"}</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirm(false)} disabled={creating}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium"><ClipboardCopy className="size-4" aria-hidden="true" />Copy remediation prompt</h3>
          <p className="mt-1 text-xs text-muted-foreground">A repository-specific prompt built from this investigation, for your own AI coding tool. No external account needed.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={copyPrompt} disabled={copying}>
            {copying ? <Spinner data-icon="inline-start" /> : copied ? <Check data-icon="inline-start" /> : <ClipboardCopy data-icon="inline-start" />}
            {copying ? "Generating…" : copied ? "Copied" : "Copy remediation prompt"}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {prompt && (
        <details className="mt-3" open={!copied}>
          <summary className="cursor-pointer text-sm">Prompt preview</summary>
          <textarea readOnly value={prompt} className="mt-2 h-64 w-full rounded-lg border bg-muted/40 p-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </details>
      )}
      {pullRequests.filter((p) => p !== openPr).length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">{pullRequests.filter((p) => p !== openPr).map((p) => <li key={p.id}>PR {p.prNumber ? <a className="underline" href={p.prUrl ?? "#"} target="_blank" rel="noreferrer">#{p.prNumber}</a> : ""} <Pill>{p.state}</Pill> <Pill t={p.verification === "fix_verified" ? "good" : p.verification === "pending" ? "neutral" : "warn"}>{p.verification.replace(/_/g, " ")}</Pill></li>)}</ul>
      )}
    </section>
  );
}
