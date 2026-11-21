import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import {
  emailDeliveryLogs,
  githubRepositories,
  investigations,
  notificationPreferences,
  notifications,
  remediationPlans,
  remediationPullRequests,
  repositoryAnalyses,
} from "../db/schema";
import { audit } from "../lib/audit";
import { authPlugin } from "../plugins/auth";
import { getPreferences } from "../services/notifications";
import { cached } from "../lib/cache";
import { userScope } from "../services/scope";

type TotalsRow = Record<string, number>;
const DAY = 86_400_000;
const TREND_DAYS = 30;

/** Sum of each repository's most recent completed analysis as of the end of every day in the window. */
function buildTrend(history: { repositoryId: string; at: Date; totals: TotalsRow }[]) {
  if (!history.length) return [];
  const sorted = [...history].sort((a, b) => +a.at - +b.at);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: { date: string; vulnerabilities: number; critical: number; high: number; medium: number; low: number }[] = [];
  const latest = new Map<string, TotalsRow>();
  let i = 0;
  for (let d = TREND_DAYS - 1; d >= 0; d--) {
    const dayStart = +today - d * DAY;
    const dayEnd = dayStart + DAY;
    for (let h = sorted[i]; h && +h.at < dayEnd; h = sorted[++i]) latest.set(h.repositoryId, h.totals);
    if (!latest.size) continue; // nothing analyzed yet on this day
    const sum = { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 };
    for (const t of latest.values()) {
      sum.vulnerabilities += t.vulnerabilities ?? 0;
      sum.critical += t.critical ?? 0;
      sum.high += t.high ?? 0;
      sum.medium += t.medium ?? 0;
      sum.low += t.low ?? 0;
    }
    days.push({ date: new Date(dayStart).toISOString().slice(0, 10), ...sum });
  }
  return days;
}

export async function buildOverview(userId: string) {
  const scope = await userScope(userId);
  const totals = {
    connectedRepositories: scope.repos.length, dependencies: 0, direct: 0, vulnerabilities: 0,
    critical: 0, high: 0, medium: 0, low: 0, malicious: 0, outdated: 0, deprecated: 0, openRemediationPrs: 0,
  };
  const repositories = [];
  for (const { repo, analysis } of scope.items) {
    const t = (analysis?.totals ?? {}) as TotalsRow;
    for (const k of ["dependencies", "direct", "vulnerabilities", "critical", "high", "medium", "low", "malicious", "outdated", "deprecated"] as const) totals[k] += t[k] ?? 0;
    repositories.push({ id: repo.id, fullName: repo.fullName, analyzed: !!analysis, totals: analysis?.totals ?? null });
  }

  if (!scope.repositoryIds.length) return { totals, repositories, recentInvestigations: [], trend: [], remediation: {} };

  const [prStates, recentInvestigations, history] = await Promise.all([
    db.select({ state: remediationPullRequests.state, n: count() }).from(remediationPullRequests).where(inArray(remediationPullRequests.repositoryId, scope.repositoryIds)).groupBy(remediationPullRequests.state),
    db.select({ id: investigations.id, package: investigations.packageName, version: investigations.installedVersion, status: investigations.status, priority: investigations.priority, createdAt: investigations.createdAt, repositoryId: investigations.repositoryId }).from(investigations).where(inArray(investigations.repositoryId, scope.repositoryIds)).orderBy(desc(investigations.createdAt)).limit(5),
    db.select({ repositoryId: repositoryAnalyses.repositoryId, at: repositoryAnalyses.completedAt, totals: repositoryAnalyses.totals }).from(repositoryAnalyses).where(and(inArray(repositoryAnalyses.repositoryId, scope.repositoryIds), eq(repositoryAnalyses.status, "completed"))).orderBy(desc(repositoryAnalyses.completedAt)).limit(500),
  ]);

  const remediation = Object.fromEntries(prStates.map((r) => [r.state, Number(r.n)]));
  totals.openRemediationPrs = remediation.open ?? 0;
  const trend = buildTrend(history.flatMap((h) => (h.at ? [{ repositoryId: h.repositoryId, at: h.at, totals: h.totals as TotalsRow }] : [])));
  return { totals, repositories, recentInvestigations, trend, remediation };
}

export const workspaceRoutes = new Elysia()
  .use(authPlugin)

  /** Security totals only count confirmed advisories; outdated packages are reported separately. */
  .get(
    "/overview",
    ({ user }) => cached(`overview:${user.id}`, 8_000, () => buildOverview(user.id)),
    { auth: true },
  )

  .get(
    "/activity",
    async ({ user }) => {
      const scope = await userScope(user.id);
      if (!scope.repositoryIds.length) return { events: [] };
      const names = new Map(scope.repos.map((r) => [r.id, r.fullName]));
      const analyses = await db.select().from(repositoryAnalyses).where(inArray(repositoryAnalyses.repositoryId, scope.repositoryIds)).orderBy(desc(repositoryAnalyses.createdAt)).limit(40);
      const prs = await db.select({ pr: remediationPullRequests, pkg: remediationPlans.packageName }).from(remediationPullRequests).innerJoin(remediationPlans, eq(remediationPlans.id, remediationPullRequests.planId)).where(inArray(remediationPullRequests.repositoryId, scope.repositoryIds)).orderBy(desc(remediationPullRequests.createdAt)).limit(30);
      const invs = await db.select({ id: investigations.id, package: investigations.packageName, version: investigations.installedVersion, status: investigations.status, priority: investigations.priority, repositoryId: investigations.repositoryId, createdAt: investigations.createdAt }).from(investigations).where(inArray(investigations.repositoryId, scope.repositoryIds)).orderBy(desc(investigations.createdAt)).limit(30);
      const events = [
        ...invs.map((i) => ({
          at: i.createdAt, type: "investigation", repositoryId: i.repositoryId, repository: names.get(i.repositoryId) ?? "",
          title: `Investigated ${i.package}@${i.version}`, detail: i.priority ? `${i.priority} priority` : null, status: i.status, link: `/dashboard/investigations/${i.id}`,
        })),
        ...analyses.map((a) => ({
          at: a.completedAt ?? a.startedAt ?? a.createdAt, type: "analysis", repositoryId: a.repositoryId, repository: names.get(a.repositoryId) ?? "",
          title: `${a.trigger === "push" ? "Push-triggered" : a.trigger === "advisory_refresh" ? "Advisory refresh" : a.trigger === "verify" ? "Fix verification" : a.trigger === "connect" ? "Initial" : a.trigger === "scheduled" ? "Weekly re-scan" : "Manual"} analysis ${a.status}`,
          detail: a.status === "failed" ? a.error : a.commitSha ? `commit ${a.commitSha.slice(0, 7)}` : null, status: a.status, link: `/dashboard/repositories/${a.repositoryId}`,
        })),
        ...prs.map(({ pr, pkg }) => ({
          at: pr.createdAt, type: "remediation", repositoryId: pr.repositoryId, repository: names.get(pr.repositoryId) ?? "",
          title: `Remediation PR ${pr.prNumber ? `#${pr.prNumber}` : ""} for ${pkg} (${pr.state})`, detail: pr.verification !== "pending" ? `verification: ${pr.verification}` : null, status: pr.state, link: "/dashboard/remediation",
        })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 80);
      return { events };
    },
    { auth: true },
  )

  .get("/notifications", async ({ user }) => ({ notifications: await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100), unread: (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))).length }), { auth: true })

  .post("/notifications/:id/read", async ({ user, params }) => {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, params.id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { ok: true };
  }, { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) })

  .post("/notifications/read-all", async ({ user }) => {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { ok: true };
  }, { auth: true })

  .get("/notifications/preferences", async ({ user }) => ({ preferences: await getPreferences(user.id) }), { auth: true })

  .patch(
    "/notifications/preferences",
    async ({ user, body }) => {
      await getPreferences(user.id);
      const [p] = await db.update(notificationPreferences).set(body).where(eq(notificationPreferences.userId, user.id)).returning();
      audit(user.id, "notification.preferences", "user", user.id, body);
      return { preferences: p };
    },
    {
      auth: true,
      body: t.Object({
        emailEnabled: t.Optional(t.Boolean()),
        minSeverity: t.Optional(t.Union([t.Literal("critical"), t.Literal("high"), t.Literal("medium"), t.Literal("low")])),
        analysisCompleted: t.Optional(t.Boolean()),
        remediationEvents: t.Optional(t.Boolean()),
        ciEvents: t.Optional(t.Boolean()),
        digestLowPriority: t.Optional(t.Boolean()),
      }),
    },
  )

  .get("/notifications/deliveries", async ({ user }) => ({ deliveries: await db.select({ id: emailDeliveryLogs.id, subject: emailDeliveryLogs.subject, status: emailDeliveryLogs.status, error: emailDeliveryLogs.error, createdAt: emailDeliveryLogs.createdAt, sentAt: emailDeliveryLogs.sentAt }).from(emailDeliveryLogs).where(eq(emailDeliveryLogs.userId, user.id)).orderBy(desc(emailDeliveryLogs.createdAt)).limit(30) }), { auth: true });

void githubRepositories;
