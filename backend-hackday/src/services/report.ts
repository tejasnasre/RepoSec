import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  investigationReports,
  investigations,
  repositoryAnalyses,
  repositoryDependencies,
  securityFindings,
  vulnerabilities,
} from "../db/schema";
import { geminiAvailable, geminiConfig, generateStructured } from "../lib/ai/gemini";

const weight = { critical: 100, high: 70, medium: 40, low: 15, informational: 5, unknown: 10 } as const;

/** Prioritization never relies on CVSS alone. */
export function priorityScore(f: {
  severity: keyof typeof weight;
  classification: string;
  isDirect: boolean;
  patchedVersion: string | null;
  reachability: string;
}) {
  let s = weight[f.severity];
  if (f.classification === "malicious_package" || f.classification === "compromised_release") s += 100;
  if (f.isDirect) s += 5; // direct deps are easier to fix and more exposed
  if (f.patchedVersion) s += 3; // an actionable patch exists
  if (f.reachability === "verified") s += 15;
  if (f.reachability === "not_found" && f.isDirect) s -= 15;
  return s;
}

export async function buildReport(analysisId: string, warnings: string[]) {
  const [analysis] = await db.select().from(repositoryAnalyses).where(eq(repositoryAnalyses.id, analysisId));
  if (!analysis) throw new Error("analysis not found");

  const deps = await db.select().from(repositoryDependencies).where(eq(repositoryDependencies.analysisId, analysisId));
  const findings = await db
    .select({ f: securityFindings, v: vulnerabilities })
    .from(securityFindings)
    .leftJoin(vulnerabilities, eq(vulnerabilities.id, securityFindings.vulnerabilityId))
    .where(eq(securityFindings.analysisId, analysisId));
  const invs = await db.select().from(investigations).where(eq(investigations.analysisId, analysisId)).orderBy(desc(investigations.createdAt));

  const secFindings = findings.filter(({ f }) => f.classification !== "deprecated_package");
  const vulnPackages = new Set(secFindings.map(({ f }) => f.dependencyId));
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, unknown: 0 };
  for (const { f } of secFindings) bySeverity[f.severity]++;

  const overview = {
    dependencies: {
      total: deps.length,
      direct: deps.filter((d) => d.isDirect).length,
      transitive: deps.filter((d) => !d.isDirect).length,
      outdated: deps.filter((d) => d.isOutdated).length,
      deprecated: deps.filter((d) => d.isDeprecated).length,
      withKnownVulnerabilities: vulnPackages.size,
      unresolved: deps.filter((d) => !d.installedVersion).length,
    },
    findingsBySeverity: bySeverity,
    malicious: secFindings.filter(({ f }) => f.classification === "malicious_package").length,
  };

  const invByDep = new Map(invs.map((i) => [i.dependencyId, i]));
  const ranked = secFindings
    .map(({ f, v }) => {
      const dep = deps.find((d) => d.id === f.dependencyId);
      return {
        findingId: f.id,
        advisory: v?.canonicalId ?? null,
        ghsaId: v?.ghsaId ?? null,
        cveId: v?.cveId ?? null,
        classification: f.classification,
        package: f.packageName,
        installedVersion: f.installedVersion,
        patchedVersion: f.patchedVersion,
        latestVersion: f.latestVersion,
        severity: f.severity,
        severitySource: v?.severitySource ?? null,
        cvssScore: v?.cvssScore ?? null,
        cwes: v?.cwes ?? [],
        summary: v?.summary ?? null,
        isDirect: f.isDirect,
        dependencyPath: dep?.dependencyPath ?? [],
        reachability: f.reachability,
        references: (v?.references ?? []).slice(0, 8),
        investigationId: invByDep.get(f.dependencyId)?.id ?? null,
        score: priorityScore(f),
      };
    })
    .sort((a, b) => b.score - a.score);

  const outdated = deps
    .filter((d) => d.isOutdated && d.isDirect)
    .slice(0, 30)
    .map((d) => ({ name: d.name, installed: d.installedVersion, latestStable: d.latestStableVersion, latestCompatible: d.latestCompatibleVersion }));

  // Executive summary: Gemini wording over deterministic numbers, with a deterministic fallback.
  let executiveSummary = deterministicSummary(overview, ranked.length);
  let recommendedActions: string[] = ranked.slice(0, 5).map((r) => `${r.package}@${r.installedVersion}: ${r.patchedVersion ? `upgrade to ${r.patchedVersion}` : "no patched version is published; review mitigation"} (${r.severity})`);
  if (geminiAvailable() && ranked.length) {
    try {
      const out = await generateStructured<{ executiveSummary: string; recommendedActions: string[] }>({
        system: "You write concise security summaries for developers. Use only the numbers and facts provided. Do not claim anything is exploitable unless reachability is 'verified'. No marketing language.",
        history: [],
        instruction: `Write an executive summary (3-5 sentences) and up to 5 recommended actions.\nOverview: ${JSON.stringify(overview)}\nTop findings: ${JSON.stringify(ranked.slice(0, 8).map((r) => ({ package: r.package, installed: r.installedVersion, patched: r.patchedVersion, severity: r.severity, classification: r.classification, direct: r.isDirect, reachability: r.reachability })))}`,
        schema: {
          type: "OBJECT",
          properties: { executiveSummary: { type: "STRING" }, recommendedActions: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["executiveSummary", "recommendedActions"],
        },
      });
      executiveSummary = out.executiveSummary;
      recommendedActions = out.recommendedActions;
    } catch (e) {
      warnings.push(`Executive summary used the deterministic fallback: ${e instanceof Error ? e.message.slice(0, 120) : "AI error"}`);
    }
  }

  const content = {
    commitSha: analysis.commitSha,
    generatedAt: new Date().toISOString(),
    model: geminiAvailable() ? geminiConfig().model : null,
    overview,
    recommendedActions,
    findings: ranked,
    investigations: invs.map((i) => ({
      id: i.id,
      package: i.packageName,
      installedVersion: i.installedVersion,
      status: i.status,
      priority: i.priority,
      summary: (i.result as { summary?: string } | null)?.summary ?? null,
    })),
    outdated,
    warnings,
    notes: [
      "Outdated and vulnerable are different things: outdated packages are never counted in vulnerability totals.",
      "An affected version in a lockfile does not prove the repository is exploitable; see each finding's reachability.",
    ],
  };

  await db.delete(investigationReports).where(eq(investigationReports.analysisId, analysisId));
  const [report] = await db
    .insert(investigationReports)
    .values({ analysisId, repositoryId: analysis.repositoryId, commitSha: analysis.commitSha ?? "unknown", executiveSummary, content })
    .returning();
  return { report: report!, overview, ranked };
}

function deterministicSummary(o: { dependencies: { total: number; direct: number; withKnownVulnerabilities: number }; findingsBySeverity: Record<string, number>; malicious: number }, findings: number) {
  if (!findings) return `${o.dependencies.total} dependencies were analyzed (${o.dependencies.direct} direct). No known vulnerabilities were found in the advisory databases for the resolved versions.`;
  const s = o.findingsBySeverity;
  return `${o.dependencies.total} dependencies were analyzed (${o.dependencies.direct} direct). ${o.dependencies.withKnownVulnerabilities} packages have known vulnerabilities: ${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low${o.malicious ? `, including ${o.malicious} malicious package alert(s)` : ""}. An affected version does not by itself prove exploitability.`;
}
