import { and, asc, count, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import {
  analysisStages,
  backgroundJobs,
  githubRepositories,
  githubRepositoryMemberships,
  investigationReports,
  repositoryAnalyses,
  repositoryCommits,
  repositoryDependencies,
  securityFindings,
} from "../db/schema";
import { audit } from "../lib/audit";
import { ApiError } from "../lib/errors";
import { authPlugin } from "../plugins/auth";
import { requestAnalysis } from "../services/analysis";
import { filterAccessibleRepositoryIds, listUserRepositories } from "../services/repositories";
import { latestAnalysis } from "../services/scope";

async function assertAccess(userId: string, repositoryId: string) {
  const ok = await filterAccessibleRepositoryIds(userId, [repositoryId]);
  if (!ok.length) throw new ApiError(404, "not_found", "Repository not found");
}

const idParam = t.Object({ id: t.String({ format: "uuid" }) });

export const repositoryRoutes = new Elysia({ prefix: "/repositories" })
  .use(authPlugin)

  /** Repositories the user has chosen to monitor, with latest analysis status and totals. */
  .get(
    "/",
    async ({ user }) => {
      const repos = (await listUserRepositories(user.id)).filter((r) => r.connected);
      const out = [];
      for (const r of repos) {
        const latest = await latestAnalysis(r.id);
        const done = latest?.status === "completed" ? latest : await latestAnalysis(r.id, true);
        const [commit] = await db.select().from(repositoryCommits).where(eq(repositoryCommits.repositoryId, r.id)).orderBy(desc(repositoryCommits.createdAt)).limit(1);
        out.push({
          ...r,
          latestCommitSha: commit?.sha ?? null,
          lastAnalyzedCommit: done?.commitSha ?? null,
          analysis: latest ? { id: latest.id, status: latest.status, currentStage: latest.currentStage, createdAt: latest.createdAt, completedAt: latest.completedAt } : null,
          totals: done?.totals ?? null,
        });
      }
      return { repositories: out };
    },
    { auth: true },
  )

  /** Connect repositories and start a background analysis for each (never blocks the request). */
  .post(
    "/connect",
    async ({ user, body }) => {
      const allowed = await filterAccessibleRepositoryIds(user.id, body.repositoryIds);
      if (allowed.length !== new Set(body.repositoryIds).size) throw new ApiError(403, "forbidden", "One or more repositories are not accessible to you");
      await db
        .insert(githubRepositoryMemberships)
        .values(allowed.map((repositoryId) => ({ userId: user.id, repositoryId })))
        .onConflictDoUpdate({ target: [githubRepositoryMemberships.userId, githubRepositoryMemberships.repositoryId], set: { connectedAt: new Date(), disconnectedAt: null } });
      const analyses = [];
      for (const repositoryId of allowed) {
        analyses.push(await requestAnalysis(repositoryId, "connect"));
        audit(user.id, "repository.connect", "repository", repositoryId);
      }
      return { connected: allowed, analyses: analyses.map((a) => ({ id: a.id, repositoryId: a.repositoryId })) };
    },
    { auth: true, body: t.Object({ repositoryIds: t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 50 }) }) },
  )

  .get(
    "/:id",
    async ({ user, params }) => {
      await assertAccess(user.id, params.id);
      const repo = (await listUserRepositories(user.id)).find((r) => r.id === params.id);
      if (!repo) throw new ApiError(404, "not_found", "Repository not found");
      const latest = await latestAnalysis(params.id);
      const done = latest?.status === "completed" ? latest : await latestAnalysis(params.id, true);
      const [commit] = await db.select().from(repositoryCommits).where(eq(repositoryCommits.repositoryId, params.id)).orderBy(desc(repositoryCommits.createdAt)).limit(1);
      return { repository: repo, latestCommit: commit ?? null, analysis: latest, lastCompletedAnalysis: done, totals: done?.totals ?? null };
    },
    { auth: true, params: idParam },
  )

  .delete(
    "/:id",
    async ({ user, params, status }) => {
      const updated = await db
        .update(githubRepositoryMemberships)
        .set({ disconnectedAt: new Date() })
        .where(and(eq(githubRepositoryMemberships.userId, user.id), eq(githubRepositoryMemberships.repositoryId, params.id), isNull(githubRepositoryMemberships.disconnectedAt)))
        .returning({ id: githubRepositoryMemberships.id });
      if (!updated.length) throw new ApiError(404, "not_found", "Repository is not connected");
      audit(user.id, "repository.disconnect", "repository", params.id);
      return status(204);
    },
    { auth: true, params: idParam },
  )

  .post(
    "/:id/rescan",
    async ({ user, params }) => {
      await assertAccess(user.id, params.id);
      const [running] = await db.select({ id: repositoryAnalyses.id }).from(repositoryAnalyses).where(and(eq(repositoryAnalyses.repositoryId, params.id), inArray(repositoryAnalyses.status, ["queued", "running"]))).limit(1);
      if (running) return { analysisId: running.id, alreadyRunning: true };
      const a = await requestAnalysis(params.id, "manual");
      audit(user.id, "repository.rescan", "repository", params.id);
      return { analysisId: a.id, alreadyRunning: false };
    },
    { auth: true, params: idParam },
  )

  .get(
    "/:id/analyses",
    async ({ user, params }) => {
      await assertAccess(user.id, params.id);
      const rows = await db.select().from(repositoryAnalyses).where(eq(repositoryAnalyses.repositoryId, params.id)).orderBy(desc(repositoryAnalyses.createdAt)).limit(50);
      return { analyses: rows };
    },
    { auth: true, params: idParam },
  )

  /** Real stage states from the worker; the UI polls this (no fake progress). */
  .get(
    "/:id/analyses/latest",
    async ({ user, params }) => {
      await assertAccess(user.id, params.id);
      const a = await latestAnalysis(params.id);
      if (!a) return { analysis: null, stages: [], job: null };
      const stages = await db.select().from(analysisStages).where(eq(analysisStages.analysisId, a.id)).orderBy(asc(analysisStages.position));
      const [job] = a.jobId ? await db.select({ status: backgroundJobs.status, attempts: backgroundJobs.attempts, lastError: backgroundJobs.lastError }).from(backgroundJobs).where(eq(backgroundJobs.id, a.jobId)) : [];
      return { analysis: a, stages, job: job ?? null };
    },
    { auth: true, params: idParam },
  )

  .get(
    "/:id/dependencies",
    async ({ user, params, query }) => {
      await assertAccess(user.id, params.id);
      const analysis = query.analysisId ? { id: query.analysisId } : await latestAnalysis(params.id, true);
      if (!analysis) return { dependencies: [], total: 0, page: 1, pageSize: 50 };
      const page = Math.max(1, Number(query.page ?? 1));
      const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));
      const vulnerableIds = db.select({ id: securityFindings.dependencyId }).from(securityFindings).where(and(eq(securityFindings.analysisId, analysis.id), inArray(securityFindings.classification, ["known_vulnerability", "malicious_package"])));
      const where = and(
        eq(repositoryDependencies.analysisId, analysis.id),
        query.q ? ilike(repositoryDependencies.name, `%${query.q.replace(/[%_]/g, "")}%`) : undefined,
        query.scope === "direct" ? eq(repositoryDependencies.isDirect, true) : undefined,
        query.scope === "transitive" ? eq(repositoryDependencies.isDirect, false) : undefined,
        query.scope === "dev" ? eq(repositoryDependencies.isDev, true) : undefined,
        query.scope === "outdated" ? eq(repositoryDependencies.isOutdated, true) : undefined,
        query.scope === "vulnerable" ? inArray(repositoryDependencies.id, vulnerableIds) : undefined,
      );
      const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(repositoryDependencies).where(where);
      const rows = await db.select().from(repositoryDependencies).where(where).orderBy(desc(repositoryDependencies.isDirect), asc(repositoryDependencies.name)).limit(pageSize).offset((page - 1) * pageSize);
      const vulnIds = new Set((await db.select({ id: securityFindings.dependencyId }).from(securityFindings).where(and(eq(securityFindings.analysisId, analysis.id), inArray(securityFindings.classification, ["known_vulnerability", "malicious_package"])))).map((r) => r.id));
      return { analysisId: analysis.id, total: Number(total), page, pageSize, dependencies: rows.map((d) => ({ ...d, hasVulnerability: vulnIds.has(d.id) })) };
    },
    {
      auth: true,
      params: idParam,
      query: t.Object({ analysisId: t.Optional(t.String({ format: "uuid" })), q: t.Optional(t.String({ maxLength: 100 })), scope: t.Optional(t.String()), page: t.Optional(t.String()), pageSize: t.Optional(t.String()) }),
    },
  )

  .get(
    "/:id/reports",
    async ({ user, params }) => {
      await assertAccess(user.id, params.id);
      const rows = await db.select({ id: investigationReports.id, analysisId: investigationReports.analysisId, commitSha: investigationReports.commitSha, executiveSummary: investigationReports.executiveSummary, createdAt: investigationReports.createdAt }).from(investigationReports).where(eq(investigationReports.repositoryId, params.id)).orderBy(desc(investigationReports.createdAt)).limit(50);
      return { reports: rows };
    },
    { auth: true, params: idParam },
  );

void githubRepositories;
void sql;
