import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FindingStatusBadge, Pill, ReachabilityBadge, SeverityBadge } from "@/components/badges";
import { FindingStatusMenu } from "@/components/finding-status-menu";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { serverApi } from "@/lib/api-server";
import { classificationLabels } from "@/lib/format";
import type { Finding } from "@/lib/types";

type Res = {
  finding: Finding & { id: string };
  dependency: { dependencyPath: string[]; lockfile: string | null };
  vulnerability: { canonicalId: string; aliases: string[]; summary: string | null; details: string | null; severitySource: string | null; cvssScore: number | null; cvssVector: string | null; cwes: string[]; references: { url: string }[]; sources: string[] } | null;
  repository: string; investigation: { id: string; status: string } | null; planId: string | null;
};

export default function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="space-y-3 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: Res;
  try { r = await serverApi<Res>(`/security/findings/${id}`); } catch (e) { if (e instanceof ApiRequestError && e.status === 404) notFound(); throw e; }
  const f = r.finding, v = r.vulnerability;
  return (
    <>
      <PageHeader title={`${f.package}@${f.installedVersion}`} description={`${classificationLabels[f.classification] ?? f.classification} in ${r.repository}`} />
      <div className="mx-6 my-6 flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><FindingStatusBadge status={f.status} /><ReachabilityBadge value={f.reachability} /><Pill>{f.isDirect ? "direct" : "transitive"}</Pill></div>
        {v && <section className="rounded-xl border p-4"><h2 className="font-medium">{v.canonicalId} <span className="font-normal text-muted-foreground">{v.aliases.filter((a) => a !== v.canonicalId).join(", ")}</span></h2><p className="mt-1">{v.summary}</p>{v.details && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{v.details.slice(0, 1500)}</p>}<p className="mt-2 text-xs text-muted-foreground">Severity per {v.severitySource ?? "unknown source"}{v.cvssScore ? ` · CVSS ${v.cvssScore}` : ""}{v.cwes.length ? ` · ${v.cwes.join(", ")}` : ""} · sources: {v.sources.join(", ")}</p></section>}
        <section className="rounded-xl border p-4">
          <h2 className="font-medium">Versions</h2>
          <p className="mt-1">Installed <span className="font-mono">{f.installedVersion}</span> · patched in <span className="font-mono">{f.patchedVersion ?? "none published"}</span> · latest stable <span className="font-mono">{f.latestVersion ?? "unknown"}</span></p>
          <p className="mt-1 text-muted-foreground">Path: {r.dependency.dependencyPath.join(" › ")}{r.dependency.lockfile ? ` (resolved from ${r.dependency.lockfile})` : ""}</p>
        </section>
        {v && v.references.length > 0 && <section className="rounded-xl border p-4"><h2 className="font-medium">References</h2><ul className="mt-1 list-disc pl-5">{v.references.slice(0, 8).map((x) => <li key={x.url}><a className="underline" href={x.url} target="_blank" rel="noreferrer">{x.url}</a></li>)}</ul></section>}
        <div className="flex flex-wrap items-center gap-3">
          {r.investigation ? <Link className="underline" href={`/dashboard/investigations/${r.investigation.id}`}>Open investigation report →</Link> : <span className="text-muted-foreground">No AI investigation exists for this finding.</span>}
          <FindingStatusMenu id={f.id} current={f.status} />
        </div>
      </div>
    </>
  );
}
