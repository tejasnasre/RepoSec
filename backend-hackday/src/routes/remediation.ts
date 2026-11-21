import { desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { ciChecks, ciRuns, githubRepositories, remediationPlans, remediationPullRequests } from "../db/schema";
import { audit } from "../lib/audit";
import { ApiError } from "../lib/errors";
import { hit } from "../lib/rate-limit";
import { authPlugin } from "../plugins/auth";
import { buildRemediationPrompt, createRemediationPr } from "../services/remediation";
import { filterAccessibleRepositoryIds } from "../services/repositories";
import { userScope } from "../services/scope";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });

async function planForUser(userId: string, planId: string) {
  const [plan] = await db.select().from(remediationPlans).where(eq(remediationPlans.id, planId));
  if (!plan) throw new ApiError(404, "not_found", "Remediation plan not found");
  if (!(await filterAccessibleRepositoryIds(userId, [plan.repositoryId])).length) throw new ApiError(404, "not_found", "Remediation plan not found");
  return plan;
}

export const remediationRoutes = new Elysia({ prefix: "/remediation" })
  .use(authPlugin)

  /** PRs created by RepoSec with their CI status and (separate) security verification. */
  .get(
    "/",
    async ({ user }) => {
      const scope = await userScope(user.id);
      if (!scope.repositoryIds.length) return { pullRequests: [] };
      const prs = await db
        .select({ pr: remediationPullRequests, plan: remediationPlans, repo: githubRepositories.fullName })
        .from(remediationPullRequests)
        .innerJoin(remediationPlans, eq(remediationPlans.id, remediationPullRequests.planId))
        .innerJoin(githubRepositories, eq(githubRepositories.id, remediationPullRequests.repositoryId))
        .where(inArray(remediationPullRequests.repositoryId, scope.repositoryIds))
        .orderBy(desc(remediationPullRequests.createdAt))
        .limit(100);
      const out = [];
      for (const { pr, plan, repo } of prs) {
        const runs = await db.select().from(ciRuns).where(eq(ciRuns.remediationPullRequestId, pr.id));
        const checks = pr.headSha ? await db.select().from(ciChecks).where(eq(ciChecks.commitSha, pr.headSha)) : [];
        const failed = runs.filter((r) => r.conclusion && !["success", "skipped", "neutral"].includes(r.conclusion)).length;
        const pending = runs.filter((r) => r.status !== "completed").length;
        out.push({
          id: pr.id, repository: repo, repositoryId: pr.repositoryId, package: plan.packageName, from: plan.currentVersion, to: plan.targetVersion,
          prNumber: pr.prNumber, prUrl: pr.prUrl, branch: pr.branch, state: pr.state, verification: pr.verification, verificationDetail: pr.verificationDetail,
          validation: pr.validation, error: pr.error, createdAt: pr.createdAt, planId: plan.id,
          ci: { total: runs.length, failed, pending, passed: runs.length - failed - pending, runs: runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.url })), checks: checks.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.url, summary: c.summary })) },
        });
      }
      return { pullRequests: out };
    },
    { auth: true },
  )

  .get(
    "/:id",
    async ({ user, params }) => {
      const plan = await planForUser(user.id, params.id);
      const prs = await db.select().from(remediationPullRequests).where(eq(remediationPullRequests.planId, plan.id)).orderBy(desc(remediationPullRequests.createdAt));
      return { plan, pullRequests: prs };
    },
    { auth: true, params: idParam },
  )

  .post(
    "/:id/generate-prompt",
    async ({ user, params }) => {
      await planForUser(user.id, params.id);
      audit(user.id, "remediation.prompt", "plan", params.id);
      return { prompt: await buildRemediationPrompt(params.id) };
    },
    { auth: true, params: idParam },
  )

  /** Creates a branch + PR. Never pushes to the default branch and never merges. */
  .post(
    "/:id/create-pr",
    async ({ user, params }) => {
      const wait = hit(`create-pr:${user.id}`, 10);
      if (wait) throw new ApiError(429, "rate_limited", `Too many requests. Retry in ${wait}s`);
      await planForUser(user.id, params.id);
      const pr = await createRemediationPr(params.id, user.id);
      audit(user.id, "remediation.create_pr", "plan", params.id, { pr: pr.prNumber, branch: pr.branch });
      return { pullRequest: pr };
    },
    { auth: true, params: idParam },
  );
