import Link from "next/link";
import { FindingStatusBadge, Pill, ReachabilityBadge, SeverityBadge } from "@/components/badges";
import { classificationLabels } from "@/lib/format";
import type { Finding } from "@/lib/types";

export function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="m-6 divide-y rounded-xl border">
      {findings.map((f) => (
        <li key={f.id}>
          <Link href={f.investigationId ? `/dashboard/investigations/${f.investigationId}` : `/dashboard/findings/${f.id}`} className="block p-4 hover:bg-muted/40">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={f.severity} />
              <span className="font-medium">{f.package}@{f.installedVersion}</span>
              <Pill>{classificationLabels[f.classification] ?? f.classification}</Pill>
              <FindingStatusBadge status={f.status} />
              {f.investigationId && <Pill t="info">Investigated</Pill>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{f.advisory ? `${f.advisory}${f.cveId && f.cveId !== f.advisory ? ` / ${f.cveId}` : ""} — ` : ""}{f.summary ?? "No advisory summary"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{f.isDirect ? "direct" : "transitive"}</span>
              <span>{f.patchedVersion ? `patched in ${f.patchedVersion}` : "no patched version published"}</span>
              <span className="truncate">{f.repository}</span>
              <ReachabilityBadge value={f.reachability} />
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
