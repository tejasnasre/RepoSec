import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  analysisStageNames,
  analysisStages,
  githubRepositories,
  investigations,
  packages as packagesTable,
  repositoryAnalyses,
  repositoryCommits,
  repositoryDependencies,
  securityFindings,
  vulnerabilities,
} from "../db/schema";
import { geminiAvailable } from "../lib/ai/gemini";
import { investigatePackage } from "../lib/ai/investigate";
import { buildInventory, discoverFiles } from "../lib/deps";
import { RepoSnapshot, getBranchHead, getTree, loadRepoContext } from "../lib/github/repo-content";
import { patchedVersionFor, resolveAdvisories, osvQueryBatch, type Advisory } from "../lib/intel/advisories";
import { pool } from "../lib/intel/http";
import { getPackument, summarize } from "../lib/intel/npm-registry";
import { enqueue } from "../lib/queue";
import { notifyRepository, repositoryName } from "./notifications";
import { buildReport } from "./report";
import { verifyRemediationFromAnalysis } from "./verification";

type Trigger = "connect" | "manual" | "push" | "advisory_refresh" | "verify";
const sevRank = { critical: 5, high: 4, medium: 3, low: 2, informational: 1, unknown: 0 } as const;

/**
 * Queue an analysis. Pushes in a burst coalesce: only one *queued* analysis job per repository
 * exists; its payload always points at the newest request, and superseded ones are kept in history.
 */
export async function requestAnalysis(repositoryId: string, trigger: Trigger, opts: { sha?: string; branch?: string; verifiesRemediationId?: string } = {}) {
  const [analysis] = await db
    .insert(repositoryAnalyses)
    .values({ repositoryId, trigger, commitSha: opts.sha ?? null, branch: opts.branch ?? null, verifiesRemediationId: opts.verifiesRemediationId ?? null })
    .returning();
  await db.insert(analysisStages).values(analysisStageNames.map((name, position) => ({ analysisId: analysis!.id, name, position })));

  const queued = await enqueue({
    type: "repository.analyze",
    payload: { analysisId: analysis!.id, repositoryId },
    // Verification runs must not be coalesced away; everything else coalesces per repository.
    dedupeKey: trigger === "verify" ? `analyze-verify:${analysis!.id}` : `analyze:${repositoryId}`,
    priority: trigger === "connect" || trigger === "manual" ? 5 : 0,
    timeoutSeconds: 1500,
    maxAttempts: 3,
  });
  await db.update(repositoryAnalyses).set({ jobId: queued.id }).where(eq(repositoryAnalyses.id, analysis!.id));

  if (queued.coalesced) {
    // The queued job now carries this analysis; any older still-queued analysis was superseded.
    await db
      .update(repositoryAnalyses)
      .set({ status: "failed", error: "Superseded by a newer commit before it started", completedAt: new Date() })
      .where(and(eq(repositoryAnalyses.repositoryId, repositoryId), eq(repositoryAnalyses.status, "queued"), ne(repositoryAnalyses.id, analysis!.id), eq(repositoryAnalyses.jobId, queued.id)));
  }
  return analysis!;
}

async function setStage(analysisId: string, name: string, status: "running" | "succeeded" | "failed" | "skipped", detail?: string) {
  const now = new Date();
  await db
    .update(analysisStages)
    .set({ status, detail: detail ?? null, ...(status === "running" ? { startedAt: now } : { finishedAt: now }) })
    .where(and(eq(analysisStages.analysisId, analysisId), eq(analysisStages.name, name)));
  if (status === "running") await db.update(repositoryAnalyses).set({ currentStage: name }).where(eq(repositoryAnalyses.id, analysisId));
}

export async function runAnalysis(analysisId: string) {
  const [analysis] = await db.select().from(repositoryAnalyses).where(eq(repositoryAnalyses.id, analysisId));
  if (!analysis) throw new Error(`analysis ${analysisId} not found`);
  if (analysis.status === "completed") return; // idempotent: a retried job must not redo finished work

  await db.update(repositoryAnalyses).set({ status: "running", startedAt: new Date(), error: null }).where(eq(repositoryAnalyses.id, analysisId));
  // Retried attempt: reset stage rows and any partial output of a previous attempt.
  await db.update(analysisStages).set({ status: "pending", detail: null, startedAt: null, finishedAt: null }).where(eq(analysisStages.analysisId, analysisId));
  await db.delete(repositoryDependencies).where(eq(repositoryDependencies.analysisId, analysisId));
  await db.delete(investigations).where(eq(investigations.analysisId, analysisId));

  const warnings: string[] = [];
  let currentName = "connecting_repository";
  const stage = async <T>(name: (typeof analysisStageNames)[number], fn: () => Promise<{ value: T; detail?: string }>) => {
    currentName = name;
    await setStage(analysisId, name, "running");
    try {
      const { value, detail } = await fn();
      await setStage(analysisId, name, "succeeded", detail);
      return value;
    } catch (e) {
      await setStage(analysisId, name, "failed", e instanceof Error ? e.message.slice(0, 300) : "failed");
      throw e;
    }
  };

  try {
    const ctx = await stage("connecting_repository", async () => ({ value: await loadRepoContext(analysis.repositoryId) }));

    const head = await stage("fetching_latest_commit", async () => {
      const branch = analysis.branch ?? ctx.defaultBranch;
      const h = analysis.commitSha
        ? { sha: analysis.commitSha, message: "", authoredAt: null as Date | null }
        : await getBranchHead(ctx, branch);
      await db
        .insert(repositoryCommits)
        .values({ repositoryId: ctx.repositoryId, sha: h.sha, branch, message: h.message, authoredAt: h.authoredAt })
        .onConflictDoNothing();
      await db.update(repositoryAnalyses).set({ commitSha: h.sha, branch }).where(eq(repositoryAnalyses.id, analysisId));
      return { value: { ...h, branch }, detail: `${branch} @ ${h.sha.slice(0, 7)}` };
    });

    // ---- dependency extraction (never executes repository code) ----
    const { snapshot, inventory } = await stage("extracting_dependencies", async () => {
      const t = await getTree(ctx, head.sha);
      if (t.truncated) warnings.push("The repository tree was truncated by GitHub; some manifests may be missing.");
      const snapshot = new RepoSnapshot(ctx, head.sha, t.entries);
      const files = discoverFiles(t.entries.filter((e) => e.type === "blob").map((e) => e.path));
      const contents = new Map<string, string>();
      await pool([...files.lockfiles, ...files.manifests], 8, async (p) => {
        const text = await snapshot.file(p, 6_000_000);
        if (text !== undefined) contents.set(p, text);
      });
      const inv = buildInventory(files, (p) => contents.get(p));
      warnings.push(...inv.warnings);
      return {
        value: { snapshot, inventory: inv.deps },
        detail: `${inv.deps.length} packages from ${files.lockfiles.length} lockfile(s), ${files.manifests.length} manifest(s)`,
      };
    });

    // ---- registry metadata + persistence of the inventory ----
    const depRows = await stage("fetching_package_metadata", async () => {
      const names = [...new Set(inventory.map((d) => d.name))];
      const docs = new Map<string, Awaited<ReturnType<typeof getPackument>>>();
      await pool(names, 12, async (n) => void docs.set(n, await getPackument(n)));
      const values = inventory.map((d) => {
        const s = summarize(docs.get(d.name) ?? null, d.version, d.declaredRange);
        const outdated = !!(d.version && s.latestStable && d.version !== s.latestStable && compareVersions(d.version, s.latestStable) < 0);
        return {
          analysisId,
          name: d.name,
          declaredRange: d.declaredRange,
          installedVersion: d.version,
          isDirect: d.isDirect,
          isDev: d.isDev,
          isPeer: d.isPeer,
          isOptional: d.isOptional,
          dependencyPath: d.path,
          lockfile: d.lockfile,
          manifestPath: d.manifestPath,
          registry: d.registry,
          latestVersion: s.latest,
          latestStableVersion: s.latestStable,
          latestCompatibleVersion: s.latestCompatible,
          isOutdated: outdated,
          isDeprecated: !!s.deprecatedMessage,
          deprecatedMessage: s.deprecatedMessage,
        };
      });
      const inserted: (typeof repositoryDependencies.$inferSelect)[] = [];
      for (let i = 0; i < values.length; i += 400) {
        inserted.push(...(await db.insert(repositoryDependencies).values(values.slice(i, i + 400)).returning()));
      }
      // registry cache (latest versions), best effort
      const cache = names.map((n) => ({ name: n, latestVersion: docs.get(n)?.["dist-tags"]?.latest ?? null })).filter((c) => c.latestVersion);
      for (let i = 0; i < cache.length; i += 300) {
        await db.insert(packagesTable).values(cache.slice(i, i + 300)).onConflictDoUpdate({ target: [packagesTable.ecosystem, packagesTable.name], set: { latestVersion: sql`excluded.latest_version`, fetchedAt: new Date() } }).catch(() => {});
      }
      return { value: inserted, detail: `${names.length} distinct packages checked against the npm registry` };
    });

    // ---- vulnerability matching ----
    const osvMatches = await stage("checking_vulnerabilities", async () => {
      const pairs = [...new Map(depRows.filter((d) => d.installedVersion).map((d) => [`${d.name}@${d.installedVersion}`, { name: d.name, version: d.installedVersion! }])).values()];
      const matches = await osvQueryBatch(pairs);
      return { value: matches, detail: `${pairs.length} package versions queried on OSV.dev; ${matches.size} with advisories` };
    });

    const advisories = await stage("researching_advisories", async () => {
      const ids = [...osvMatches.values()].flat();
      const map = ids.length ? await resolveAdvisories(ids, ctx.token) : new Map<string, Advisory>();
      return { value: map, detail: `${new Set([...map.values()].map((a) => a.row.id)).size} unique advisories after cross-source deduplication` };
    });

    // ---- findings ----
    const previous = await db
      .select({ key: securityFindings.findingKey, status: securityFindings.status })
      .from(securityFindings)
      .where(and(eq(securityFindings.repositoryId, ctx.repositoryId), inArray(securityFindings.status, ["false_positive", "accepted_risk"])));
    const inherit = new Map(previous.map((p) => [p.key, p.status]));

    const findingValues: (typeof securityFindings.$inferInsert)[] = [];
    for (const dep of depRows) {
      if (!dep.installedVersion) continue;
      const ids = osvMatches.get(`${dep.name}@${dep.installedVersion}`) ?? [];
      const seen = new Set<string>();
      for (const id of ids) {
        const adv = advisories.get(id);
        if (!adv || seen.has(adv.row.id)) continue;
        seen.add(adv.row.id);
        const key = `${ctx.repositoryId}:${dep.name}:${adv.row.canonicalId}`;
        findingValues.push({
          analysisId,
          repositoryId: ctx.repositoryId,
          dependencyId: dep.id,
          vulnerabilityId: adv.row.id,
          findingKey: key,
          classification: adv.row.isMalicious ? "malicious_package" : "known_vulnerability",
          severity: adv.row.severity,
          status: inherit.get(key) ?? "open",
          packageName: dep.name,
          installedVersion: dep.installedVersion,
          patchedVersion: patchedVersionFor(adv.records, dep.name, dep.installedVersion),
          latestVersion: dep.latestStableVersion,
          isDirect: dep.isDirect,
          reachability: "unknown",
          commitSha: head.sha,
        });
      }
      if (dep.isDeprecated) {
        findingValues.push({
          analysisId,
          repositoryId: ctx.repositoryId,
          dependencyId: dep.id,
          findingKey: `${ctx.repositoryId}:${dep.name}:deprecated`,
          classification: "deprecated_package",
          severity: "informational",
          status: inherit.get(`${ctx.repositoryId}:${dep.name}:deprecated`) ?? "open",
          packageName: dep.name,
          installedVersion: dep.installedVersion,
          latestVersion: dep.latestStableVersion,
          isDirect: dep.isDirect,
          commitSha: head.sha,
        });
      }
    }
    for (let i = 0; i < findingValues.length; i += 300) await db.insert(securityFindings).values(findingValues.slice(i, i + 300));

    // ---- AI investigations (bounded, parallel, evidence-backed) ----
    const vulnFindings = findingValues.filter((f) => f.classification === "known_vulnerability" || f.classification === "malicious_package");
    await stage("investigating_packages", async () => {
      if (!vulnFindings.length) return { value: 0, detail: "No vulnerable packages to investigate" };
      if (!geminiAvailable()) {
        warnings.push("GEMINI_API_KEY / GEMINI_MODEL are not configured; investigations were skipped.");
        return { value: 0, detail: "Skipped: Gemini is not configured" };
      }
      const byDep = new Map<string, typeof vulnFindings>();
      for (const f of vulnFindings) byDep.set(f.dependencyId, [...(byDep.get(f.dependencyId) ?? []), f]);
      const targets = [...byDep.entries()]
        .map(([depId, fs]) => ({ depId, fs, rank: Math.max(...fs.map((f) => sevRank[f.severity ?? "unknown"] + (f.classification === "malicious_package" ? 10 : 0))) + (fs[0]!.isDirect ? 0.5 : 0) }))
        .sort((a, b) => b.rank - a.rank);
      const limit = Number(process.env.INVESTIGATION_LIMIT ?? 6);
      const chosen = targets.slice(0, limit);
      let done = 0;
      let failed = 0;
      await pool(chosen, 3, async ({ depId, fs }) => {
        const dep = depRows.find((d) => d.id === depId)!;
        const [inv] = await db
          .insert(investigations)
          .values({ analysisId, repositoryId: ctx.repositoryId, dependencyId: depId, packageName: dep.name, installedVersion: dep.installedVersion!, commitSha: head.sha })
          .returning();
        const advs = [...new Map(fs.map((f) => [f.vulnerabilityId, [...advisories.values()].find((a) => a.row.id === f.vulnerabilityId)!])).values()].filter(Boolean);
        try {
          await investigatePackage({
            investigationId: inv!.id,
            analysisId,
            repositoryId: ctx.repositoryId,
            snapshot,
            ghToken: ctx.token,
            dependency: { id: dep.id, name: dep.name, version: dep.installedVersion!, isDirect: dep.isDirect, path: dep.dependencyPath, declaredRange: dep.declaredRange, latestStable: dep.latestStableVersion, latestCompatible: dep.latestCompatibleVersion, deprecatedMessage: dep.deprecatedMessage },
            advisories: advs,
          });
          done++;
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : "investigation failed";
          warnings.push(`Investigation of ${dep.name} failed: ${msg.slice(0, 140)}`);
          await db.update(investigations).set({ status: "failed", error: msg.slice(0, 500), completedAt: new Date() }).where(eq(investigations.id, inv!.id));
        }
      });
      const skipped = targets.length - chosen.length;
      if (skipped > 0) warnings.push(`${skipped} lower-priority package(s) were not investigated (limit ${limit}); their advisory data is still shown.`);
      return { value: done, detail: `${done} investigated, ${failed} failed, ${skipped} deferred` };
    });

    // ---- report ----
    const built = await stage("generating_report", async () => {
      const r = await buildReport(analysisId, warnings);
      return { value: r, detail: "Report saved for commit " + head.sha.slice(0, 7) };
    });

    const totals = {
      dependencies: built.overview.dependencies.total,
      direct: built.overview.dependencies.direct,
      outdated: built.overview.dependencies.outdated,
      vulnerabilities: built.ranked.length,
      critical: built.overview.findingsBySeverity.critical,
      high: built.overview.findingsBySeverity.high,
      medium: built.overview.findingsBySeverity.medium,
      low: built.overview.findingsBySeverity.low,
      malicious: built.overview.malicious,
      deprecated: built.overview.dependencies.deprecated,
    };

    await stage("sending_notifications", async () => {
      const name = await repositoryName(ctx.repositoryId);
      const sha7 = head.sha.slice(0, 7);
      const path = `/dashboard/repositories/${ctx.repositoryId}`;
      await notifyRepository({
        kind: "analysis_completed",
        severity: "info",
        category: "analysis",
        repositoryId: ctx.repositoryId,
        dedupeKey: `analysis:${analysisId}`,
        title: `Analysis complete: ${name} @ ${sha7}`,
        body: `${built.report.executiveSummary}\n\nAnalyzed commit ${head.sha}.`,
        path,
      });
      // One alert per package version (not per advisory) so a package with many advisories sends one email.
      const alertable = built.ranked.filter((x) => x.severity === "critical" || x.severity === "high" || x.classification === "malicious_package");
      const groups = new Map<string, typeof alertable>();
      for (const r of alertable) groups.set(`${r.package}@${r.installedVersion}`, [...(groups.get(`${r.package}@${r.installedVersion}`) ?? []), r]);
      for (const [pkgKey, items] of [...groups.entries()].slice(0, 10)) {
        const top = items[0]!; // ranked by priority score
        const malicious = items.some((i) => i.classification === "malicious_package");
        const sev = malicious || top.severity === "critical" ? "critical" : "high";
        const patched = items.map((i) => i.patchedVersion).filter((v): v is string => !!v).sort(compareVersions).at(-1);
        await notifyRepository({
          kind: malicious ? "malicious_package" : sev === "critical" ? "critical_vulnerability" : "high_vulnerability",
          severity: sev,
          category: "analysis",
          repositoryId: ctx.repositoryId,
          // the same advisory set on the same package version is announced once, not on every scan
          dedupeKey: `finding:${ctx.repositoryId}:${pkgKey}:${items.map((i) => i.advisory).sort().join(",")}`.slice(0, 480),
          title: `${malicious ? "MALICIOUS PACKAGE" : sev.toUpperCase()}: ${pkgKey} in ${name} (${items.length} advisor${items.length === 1 ? "y" : "ies"})`,
          body: `${top.summary ?? top.advisory ?? "Known vulnerability"}${items.length > 1 ? `\n+${items.length - 1} more advisories on this version.` : ""}\n${patched ? `Upgrade to at least ${patched} to fix all of them.` : "No patched version is published for at least one advisory."}\nAn affected version is present in the lockfile; exploitability is ${items.some((i) => i.reachability === "verified") ? "supported by code usage" : "not established"}.`,
          path: top.investigationId ? `/dashboard/investigations/${top.investigationId}` : path,
        });
      }
      return { value: null, detail: "Notifications queued per user preferences" };
    });

    await db.update(repositoryAnalyses).set({ status: "completed", completedAt: new Date(), currentStage: "completed", totals }).where(eq(repositoryAnalyses.id, analysisId));
    await db.update(githubRepositories).set({ updatedAt: new Date() }).where(eq(githubRepositories.id, ctx.repositoryId));

    if (analysis.verifiesRemediationId) await verifyRemediationFromAnalysis(analysis.verifiesRemediationId, analysisId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "analysis failed";
    await db.update(repositoryAnalyses).set({ status: "failed", error: `${currentName}: ${message}`.slice(0, 500), completedAt: new Date() }).where(eq(repositoryAnalyses.id, analysisId));
    throw e; // let the queue retry with backoff / dead-letter
  }
}

function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Periodic advisory refresh: re-checks the latest completed inventory of each connected repository. */
export async function refreshAdvisoriesForRepository(repositoryId: string) {
  const [latest] = await db
    .select()
    .from(repositoryAnalyses)
    .where(and(eq(repositoryAnalyses.repositoryId, repositoryId), eq(repositoryAnalyses.status, "completed")))
    .orderBy(desc(repositoryAnalyses.completedAt))
    .limit(1);
  if (!latest) return null;
  const deps = await db.select({ name: repositoryDependencies.name, v: repositoryDependencies.installedVersion }).from(repositoryDependencies).where(eq(repositoryDependencies.analysisId, latest.id));
  const pairs = [...new Map(deps.filter((d) => d.v).map((d) => [`${d.name}@${d.v}`, { name: d.name, version: d.v! }])).values()];
  const matches = await osvQueryBatch(pairs);
  const known = await db.select({ key: securityFindings.findingKey }).from(securityFindings).where(eq(securityFindings.analysisId, latest.id));
  const knownKeys = new Set(known.map((k) => k.key));
  const advisories = matches.size ? await resolveAdvisories([...matches.values()].flat()) : new Map<string, Advisory>();
  let fresh = 0;
  for (const [pkgKey, ids] of matches) {
    for (const id of ids) {
      const adv = advisories.get(id);
      if (adv && !knownKeys.has(`${repositoryId}:${pkgKey.slice(0, pkgKey.lastIndexOf("@"))}:${adv.row.canonicalId}`)) fresh++;
    }
  }
  // Only a genuinely new advisory triggers a full re-evaluation (new, separate analysis; history preserved).
  if (fresh > 0) await requestAnalysis(repositoryId, "advisory_refresh", { sha: latest.commitSha ?? undefined });
  return { checked: pairs.length, newAdvisories: fresh };
}

void vulnerabilities;
