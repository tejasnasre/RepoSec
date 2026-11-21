import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { FindingStatusBadge, Pill, ReachabilityBadge, SeverityBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { RemediationActions } from "@/components/remediation-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { serverApi } from "@/lib/api-server";
import { shortSha, timeAgo } from "@/lib/format";
import type { EvidenceItem, Finding } from "@/lib/types";

type Result = {
  summary: string; rootCause: string; affectedVersions: string; patchedVersions: string; severityAssessment: string; attackScenario: string;
  prerequisites: string[]; potentialImpact: string;
  repoImpact: { affected: boolean; why: string; filesUsingPackage: string[]; vulnerableApisUsed: string[]; reachability: string; reachabilityNotes: string; whatToInvestigate: string[] };
  versionComparison: { installed: string; latestStable: string; minimumPatched: string; recommended: string; reason: string; majorUpgradeRequired: boolean };
  migration: { officialChangelogUrl: string; releaseNotesUrl: string; migrationGuideUrl: string; breakingChanges: string[]; deprecatedApis: string[]; requiredCodeChanges: string[]; filesLikelyToChange: string[]; peerDependencyNotes: string[]; testRecommendations: string[]; rollback: string };
  priority: { level: string; rationale: string }; officialSourceFound: boolean; officialSourceNote: string;
};
type Res = {
  investigation: { id: string; packageName: string; installedVersion: string; commitSha: string | null; status: string; model: string | null; priority: string | null; result: Result | null; error: string | null; completedAt: string | null };
  repository: { id: string; fullName: string; htmlUrl: string };
  dependency: { isDirect: boolean; dependencyPath: string[]; lockfile: string | null; declaredRange: string | null } | null;
  findings: (Finding & { advisory: { canonicalId: string; aliases: string[]; summary: string | null; severity: string; severitySource: string | null; cvssScore: number | null; cwes: string[]; references: { url: string }[]; publishedAt: string | null; sources: string[] } | null })[];
  evidence: EvidenceItem[];
  steps: { id: string; kind: string; name: string; ok: boolean; outputSummary: string | null }[];
  plan: { id: string; targetVersion: string | null } | null;
  pullRequests: { id: string; prNumber: number | null; prUrl: string | null; state: string; verification: string; branch: string }[];
};

export default function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<><PageHeader title="Investigation" /><div className="space-y-4 p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div></>}>
      <Content params={params} />
    </Suspense>
  );
}

const List = ({ items, empty = "None identified" }: { items?: string[]; empty?: string }) =>
  items?.length ? <ul className="list-disc space-y-1 pl-5">{items.map((i, n) => <li key={n}>{i}</li>)}</ul> : <p className="text-muted-foreground">{empty}</p>;
const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="rounded-xl border p-4"><h2 id={id} className="mb-2 font-medium">{title}</h2><div className="space-y-2 text-sm">{children}</div></section>
);
const Link_ = ({ href, label }: { href: string; label: string }) => /^https?:\/\//.test(href) ? <a className="inline-flex items-center gap-1 underline" href={href} target="_blank" rel="noreferrer">{label}<ExternalLink className="size-3" aria-hidden="true" /></a> : <span className="text-muted-foreground">{label}: not found</span>;

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: Res;
  try { r = await serverApi<Res>(`/security/investigations/${id}`); } catch (e) { if (e instanceof ApiRequestError && e.status === 404) notFound(); throw e; }
  const { investigation: inv, repository, dependency: dep, findings, evidence, plan, pullRequests, steps } = r;
  const res = inv.result;
  const sev = findings.map((f) => f.severity)[0] ?? "unknown";

  return (
    <>
      <PageHeader title={`${inv.packageName}@${inv.installedVersion}`} description={`${repository.fullName} · commit ${shortSha(inv.commitSha)} · ${inv.model ? `researched with ${inv.model}` : ""}`} />
      <div className="mx-6 my-6 flex flex-col gap-4">
        {inv.status !== "completed" || !res ? (
          <div className="rounded-xl border p-6 text-center text-sm">
            <p className="font-medium capitalize">{inv.status}</p>
            <p className="mt-1 text-muted-foreground">{inv.error ?? "The investigation is still running. Refresh in a moment."}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={sev} />
              <Pill t={res.priority.level === "critical" ? "bad" : res.priority.level === "high" ? "warn" : "neutral"} className="capitalize">{res.priority.level} remediation priority</Pill>
              <ReachabilityBadge value={res.repoImpact.reachability} />
              <Pill t={res.officialSourceFound ? "good" : "warn"}>{res.officialSourceFound ? "Official source found" : "No official source found"}</Pill>
              <Pill>{dep?.isDirect ? "direct dependency" : "transitive dependency"}</Pill>
              <span className="text-xs text-muted-foreground">completed {timeAgo(inv.completedAt)}</span>
            </div>

            <Section id="exec" title="A. What happened">
              <p>{res.summary}</p>
              <p><span className="font-medium">Root cause: </span>{res.rootCause}</p>
              <p><span className="font-medium">Attack scenario: </span>{res.attackScenario}</p>
              <p><span className="font-medium">Potential impact: </span>{res.potentialImpact}</p>
              {res.prerequisites?.length > 0 && <><p className="font-medium">Exploitation prerequisites</p><List items={res.prerequisites} /></>}
            </Section>

            <Section id="advisories" title="B. Vulnerabilities & affected versions">
              {findings.map((f) => (
                <div key={f.id} className="rounded-lg bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} /><span className="font-medium">{f.advisory?.canonicalId ?? f.package}</span>
                    {f.advisory?.aliases.filter((a) => a !== f.advisory?.canonicalId).map((a) => <span key={a} className="font-mono text-xs text-muted-foreground">{a}</span>)}
                    <FindingStatusBadge status={f.status} />
                  </div>
                  <p className="mt-1">{f.advisory?.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Installed <span className="font-mono">{f.installedVersion}</span> · patched in <span className="font-mono">{f.patchedVersion ?? "none published"}</span> · latest <span className="font-mono">{f.latestVersion ?? "?"}</span>
                    {f.advisory?.cvssScore ? ` · CVSS ${f.advisory.cvssScore}` : ""}{f.advisory?.cwes.length ? ` · ${f.advisory.cwes.join(", ")}` : ""} · severity per {f.advisory?.severitySource ?? "unknown"} · via {f.advisory?.sources.join(" + ")}
                  </p>
                </div>
              ))}
              <p className="text-muted-foreground">Affected range: {res.affectedVersions} · Patched: {res.patchedVersions}</p>
            </Section>

            <Section id="impact" title="C. Impact on this repository">
              <p>{res.repoImpact.why}</p>
              <p className="text-muted-foreground">Dependency path: {dep?.dependencyPath.join(" › ") || "unknown"}{dep?.lockfile ? ` (resolved from ${dep.lockfile})` : ""}</p>
              <p className="font-medium">Files referencing the package</p><List items={res.repoImpact.filesUsingPackage} empty="No source references found" />
              <p className="font-medium">Vulnerable APIs seen in use</p><List items={res.repoImpact.vulnerableApisUsed} empty="None confirmed" />
              <p><span className="font-medium">Reachability: </span>{res.repoImpact.reachability}. {res.repoImpact.reachabilityNotes}</p>
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">An affected version in the lockfile does not prove exploitability. Reachability is only “verified” when code that calls the vulnerable API was found.</p>
              {res.repoImpact.whatToInvestigate?.length > 0 && <><p className="font-medium">What to investigate</p><List items={res.repoImpact.whatToInvestigate} /></>}
            </Section>

            <Section id="versions" title="D. Version comparison">
              <div className="grid gap-2 sm:grid-cols-4">
                {[["Installed", res.versionComparison.installed], ["Minimum patched", res.versionComparison.minimumPatched], ["Recommended", res.versionComparison.recommended], ["Latest stable", res.versionComparison.latestStable]].map(([l, v]) => (
                  <div key={l} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-mono">{v || "unknown"}</p></div>
                ))}
              </div>
              <p>{res.versionComparison.reason}{res.versionComparison.majorUpgradeRequired ? " This is a major-version upgrade; read the migration guide first." : ""}</p>
            </Section>

            <Section id="migration" title="E. Migration intelligence">
              <p className="flex flex-wrap gap-4"><Link_ href={res.migration.officialChangelogUrl} label="Changelog" /><Link_ href={res.migration.releaseNotesUrl} label="Release notes" /><Link_ href={res.migration.migrationGuideUrl} label="Migration guide" /></p>
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="font-medium">Breaking changes</p><List items={res.migration.breakingChanges} /></div>
                <div><p className="font-medium">Deprecated APIs</p><List items={res.migration.deprecatedApis} /></div>
                <div><p className="font-medium">Required code changes</p><List items={res.migration.requiredCodeChanges} /></div>
                <div><p className="font-medium">Files likely to change</p><List items={res.migration.filesLikelyToChange} /></div>
                <div><p className="font-medium">Peer dependency notes</p><List items={res.migration.peerDependencyNotes} /></div>
                <div><p className="font-medium">Test recommendations</p><List items={res.migration.testRecommendations} /></div>
              </div>
              <p><span className="font-medium">Rollback: </span>{res.migration.rollback}</p>
            </Section>

            <Section id="priority" title="F. Remediation priority">
              <p><span className="font-medium capitalize">{res.priority.level}</span>. {res.priority.rationale}</p>
              <p className="text-xs text-muted-foreground">Priority weighs severity, confirmed affected version, exploitability evidence, exposure, patch availability and malicious-release status, not CVSS alone.</p>
            </Section>

            <Section id="evidence" title="G. Evidence">
              <p className="text-xs text-muted-foreground">{res.officialSourceNote}</p>
              <ul className="divide-y rounded-lg border">
                {evidence.map((e) => (
                  <li key={e.id} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill t={e.status === "confirmed" ? "good" : "warn"}>{e.status}</Pill>
                      <Pill t={e.sourceType === "official" || e.sourceType === "advisory_database" ? "info" : "neutral"}>{e.sourceType.replace(/_/g, " ")}</Pill>
                      <Pill>{e.confidence} confidence</Pill>
                      <span className="text-xs text-muted-foreground">retrieved {timeAgo(e.retrievedAt)}</span>
                    </div>
                    <p className="mt-1 font-medium">{e.claim}</p>
                    <p className="text-muted-foreground">{e.evidence}</p>
                    {e.sourceUrl && <a className="text-xs underline" href={e.sourceUrl} target="_blank" rel="noreferrer">{e.sourceUrl}</a>}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Official sources and advisory databases are labeled separately from community research. “Inferred” means model reasoning without a retrieved source.</p>
            </Section>

            {plan && <RemediationActions planId={plan.id} pkg={inv.packageName} from={inv.installedVersion} to={plan.targetVersion} pullRequests={pullRequests} />}

            {steps.length > 0 && (
              <details className="rounded-xl border p-4 text-sm">
                <summary className="cursor-pointer font-medium">Investigation timeline ({steps.length} steps)</summary>
                <ol className="mt-3 space-y-1">{steps.map((s) => <li key={s.id} className="flex gap-2"><span className={s.ok ? "text-emerald-600" : "text-destructive"}>●</span><span><span className="font-mono text-xs">{s.name}</span>{s.outputSummary && <span className="block text-xs text-muted-foreground">{s.outputSummary.slice(0, 160)}</span>}</span></li>)}</ol>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}
