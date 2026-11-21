import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import {
  investigationEvidence,
  investigationReports,
  investigationSteps,
  investigations,
  remediationPlans,
  remediationPullRequests,
  repositoryDependencies,
  securityFindings,
  vulnerabilities,
  findingStatuses,
  githubRepositories,
} from "../db/schema";
import { audit } from "../lib/audit";
import { ApiError } from "../lib/errors";
import { authPlugin } from "../plugins/auth";
import { filterAccessibleRepositoryIds } from "../services/repositories";
import { userScope } from "../services/scope";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4, unknown: 5 } as const;

async function assertRepo(userId: string, repositoryId: string) {
  if (!(await filterAccessibleRepositoryIds(userId, [repositoryId])).length) throw new ApiError(404, "not_found", "Not found");
}

export const securityRoutes = new Elysia({ prefix: "/security" })
  .use(authPlugin)

  /** Findings from the latest completed analysis of each connected repository. Outdated packages are NOT findings. */
  .get(
    "/findings",
    async ({ user, query }) => {
      const scope = await userScope(user.id);
      if (!scope.analysisIds.length) return { findings: [] };
      const rows = await db
        .select({ f: securityFindings, v: vulnerabilities, repo: githubRepositories.fullName, dep: repositoryDependencies.dependencyPath })
        .from(securityFindings)
        .leftJoin(vulnerabilities, eq(vulnerabilities.id, securityFindings.vulnerabilityId))
        .innerJoin(githubRepositories, eq(githubRepositories.id, securityFindings.repositoryId))
        .innerJoin(repositoryDependencies, eq(repositoryDependencies.id, securityFindings.dependencyId))
        .where(
          and(
            inArray(securityFindings.analysisId, scope.analysisIds),
            query.repositoryId ? eq(securityFindings.repositoryId, query.repositoryId) : undefined,
            query.severity ? eq(securityFindings.severity, query.severity as never) : undefined,
            query.classification ? eq(securityFindings.classification, query.classification as never) : undefined,
            query.status ? eq(securityFindings.status, query.status as never) : undefined,
          ),
        );
      const invs = await db.select({ id: investigations.id, dependencyId: investigations.dependencyId }).from(investigations).where(inArray(investigations.analysisId, scope.analysisIds));
      const invByDep = new Map(invs.map((i) => [i.dependencyId, i.id]));
      const findings = rows
        .map(({ f, v, repo, dep }) => ({
          id: f.id, repository: repo, repositoryId: f.repositoryId, classification: f.classification, severity: f.severity, status: f.status,
          package: f.packageName, installedVersion: f.installedVersion, patchedVersion: f.patchedVersion, latestVersion: f.latestVersion,
          isDirect: f.isDirect, reachability: f.reachability, dependencyPath: dep, commitSha: f.commitSha,
          advisory: v?.canonicalId ?? null, ghsaId: v?.ghsaId ?? null, cveId: v?.cveId ?? null, summary: v?.summary ?? null, cvssScore: v?.cvssScore ?? null,
          investigationId: invByDep.get(f.dependencyId) ?? null,
        }))
        .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.package.localeCompare(b.package));
      return { findings };
    },
    { auth: true, query: t.Object({ repositoryId: t.Optional(t.String({ format: "uuid" })), severity: t.Optional(t.String()), classification: t.Optional(t.String()), status: t.Optional(t.String()) }) },
  )

  .get(
    "/findings/:id",
    async ({ user, params }) => {
      const [row] = await db
        .select({ f: securityFindings, v: vulnerabilities, dep: repositoryDependencies, repo: githubRepositories.fullName })
        .from(securityFindings)
        .leftJoin(vulnerabilities, eq(vulnerabilities.id, securityFindings.vulnerabilityId))
        .innerJoin(repositoryDependencies, eq(repositoryDependencies.id, securityFindings.dependencyId))
        .innerJoin(githubRepositories, eq(githubRepositories.id, securityFindings.repositoryId))
        .where(eq(securityFindings.id, params.id));
      if (!row) throw new ApiError(404, "not_found", "Finding not found");
      await assertRepo(user.id, row.f.repositoryId);
      const [inv] = await db.select({ id: investigations.id, status: investigations.status, priority: investigations.priority }).from(investigations).where(eq(investigations.dependencyId, row.f.dependencyId)).limit(1);
      const [plan] = inv ? await db.select({ id: remediationPlans.id }).from(remediationPlans).where(eq(remediationPlans.investigationId, inv.id)) : [];
      return { finding: row.f, vulnerability: row.v, dependency: row.dep, repository: row.repo, investigation: inv ?? null, planId: plan?.id ?? null };
    },
    { auth: true, params: idParam },
  )

  .patch(
    "/findings/:id/status",
    async ({ user, params, body }) => {
      const [f] = await db.select().from(securityFindings).where(eq(securityFindings.id, params.id));
      if (!f) throw new ApiError(404, "not_found", "Finding not found");
      await assertRepo(user.id, f.repositoryId);
      const [u] = await db.update(securityFindings).set({ status: body.status }).where(eq(securityFindings.id, params.id)).returning();
      audit(user.id, "finding.status", "finding", params.id, { from: f.status, to: body.status });
      return { finding: u };
    },
    { auth: true, params: idParam, body: t.Object({ status: t.Union([t.Literal("open"), t.Literal("false_positive"), t.Literal("accepted_risk"), t.Literal("closed")]) }) },
  )

  /** Deduplicated advisories affecting the user's repositories right now. */
  .get(
    "/vulnerabilities",
    async ({ user }) => {
      const scope = await userScope(user.id);
      if (!scope.analysisIds.length) return { vulnerabilities: [] };
      const rows = await db
        .select({ f: securityFindings, v: vulnerabilities, repo: githubRepositories.fullName })
        .from(securityFindings)
        .innerJoin(vulnerabilities, eq(vulnerabilities.id, securityFindings.vulnerabilityId))
        .innerJoin(githubRepositories, eq(githubRepositories.id, securityFindings.repositoryId))
        .where(inArray(securityFindings.analysisId, scope.analysisIds));
      const map = new Map<string, { v: typeof vulnerabilities.$inferSelect; packages: Set<string>; repos: Set<string> }>();
      for (const { f, v, repo } of rows) {
        const e = map.get(v.id) ?? { v, packages: new Set(), repos: new Set() };
        e.packages.add(`${f.packageName}@${f.installedVersion}`);
        e.repos.add(repo);
        map.set(v.id, e);
      }
      const list = [...map.values()].map(({ v, packages, repos }) => ({
        id: v.id, canonicalId: v.canonicalId, aliases: v.aliases, ghsaId: v.ghsaId, cveId: v.cveId, isMalicious: v.isMalicious, summary: v.summary,
        severity: v.severity, severitySource: v.severitySource, cvssScore: v.cvssScore, cwes: v.cwes, publishedAt: v.publishedAt, sources: v.sources,
        references: v.references.slice(0, 6), affectedPackages: [...packages], repositories: [...repos],
      })).sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
      return { vulnerabilities: list };
    },
    { auth: true },
  )

  .get(
    "/investigations",
    async ({ user }) => {
      const scope = await userScope(user.id);
      if (!scope.repositoryIds.length) return { investigations: [] };
      const rows = await db
        .select({ i: investigations, repo: githubRepositories.fullName })
        .from(investigations)
        .innerJoin(githubRepositories, eq(githubRepositories.id, investigations.repositoryId))
        .where(inArray(investigations.repositoryId, scope.repositoryIds))
        .orderBy(desc(investigations.createdAt))
        .limit(100);
      return {
        investigations: rows.map(({ i, repo }) => ({
          id: i.id, repository: repo, repositoryId: i.repositoryId, package: i.packageName, installedVersion: i.installedVersion, commitSha: i.commitSha,
          status: i.status, priority: i.priority, summary: (i.result as { summary?: string } | null)?.summary ?? null, createdAt: i.createdAt, error: i.error,
        })),
      };
    },
    { auth: true },
  )

  .get(
    "/investigations/:id",
    async ({ user, params }) => {
      const [i] = await db.select().from(investigations).where(eq(investigations.id, params.id));
      if (!i) throw new ApiError(404, "not_found", "Investigation not found");
      await assertRepo(user.id, i.repositoryId);
      const [repo] = await db.select().from(githubRepositories).where(eq(githubRepositories.id, i.repositoryId));
      const evidence = await db.select().from(investigationEvidence).where(eq(investigationEvidence.investigationId, i.id));
      const steps = await db.select().from(investigationSteps).where(eq(investigationSteps.investigationId, i.id)).orderBy(investigationSteps.position);
      const findings = await db
        .select({ f: securityFindings, v: vulnerabilities })
        .from(securityFindings)
        .leftJoin(vulnerabilities, eq(vulnerabilities.id, securityFindings.vulnerabilityId))
        .where(and(eq(securityFindings.analysisId, i.analysisId), eq(securityFindings.packageName, i.packageName)));
      const [dep] = i.dependencyId ? await db.select().from(repositoryDependencies).where(eq(repositoryDependencies.id, i.dependencyId)) : [];
      const [plan] = await db.select().from(remediationPlans).where(eq(remediationPlans.investigationId, i.id));
      const prs = plan ? await db.select().from(remediationPullRequests).where(eq(remediationPullRequests.planId, plan.id)).orderBy(desc(remediationPullRequests.createdAt)) : [];
      return {
        investigation: i,
        repository: { id: repo!.id, fullName: repo!.fullName, htmlUrl: repo!.htmlUrl, defaultBranch: repo!.defaultBranch },
        dependency: dep ?? null,
        findings: findings.map(({ f, v }) => ({ ...f, advisory: v ? { canonicalId: v.canonicalId, aliases: v.aliases, summary: v.summary, details: v.details, severity: v.severity, severitySource: v.severitySource, cvssScore: v.cvssScore, cvssVector: v.cvssVector, cwes: v.cwes, references: v.references, publishedAt: v.publishedAt, sources: v.sources } : null })),
        evidence,
        steps,
        plan: plan ?? null,
        pullRequests: prs,
      };
    },
    { auth: true, params: idParam },
  );

export const reportRoutes = new Elysia()
  .use(authPlugin)
  .get(
    "/reports/:id",
    async ({ user, params }) => {
      const [r] = await db.select().from(investigationReports).where(eq(investigationReports.id, params.id));
      if (!r) throw new ApiError(404, "not_found", "Report not found");
      await assertRepo(user.id, r.repositoryId);
      const [repo] = await db.select({ fullName: githubRepositories.fullName }).from(githubRepositories).where(eq(githubRepositories.id, r.repositoryId));
      return { report: r, repository: repo?.fullName ?? null };
    },
    { auth: true, params: idParam },
  );

void findingStatuses;
