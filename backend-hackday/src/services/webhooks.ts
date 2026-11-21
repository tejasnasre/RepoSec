import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import {
  githubInstallations,
  githubRepositories,
  githubRepositoryMemberships,
  githubWebhookEvents,
  remediationPlans,
  remediationPullRequests,
  repositoryAnalyses,
  securityFindings,
} from "../db/schema";
import { requestAnalysis } from "./analysis";
import { processCiEvent } from "./ci";
import { upsertInstallation, syncInstallationRepositories } from "./github-sync";
import { notifyRepository, repositoryName } from "./notifications";
import { verifyRemediationFromAnalysis } from "./verification";

export function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Payload = Record<string, any>;

async function connectedRepositoriesByGithubId(githubRepoId: number) {
  const repos = await db.select().from(githubRepositories).where(and(eq(githubRepositories.githubRepoId, githubRepoId), isNull(githubRepositories.removedAt)));
  const out: (typeof repos)[number][] = [];
  for (const r of repos) {
    const members = await db.select({ id: githubRepositoryMemberships.id }).from(githubRepositoryMemberships).where(and(eq(githubRepositoryMemberships.repositoryId, r.id), isNull(githubRepositoryMemberships.disconnectedAt))).limit(1);
    if (members.length) out.push(r);
  }
  return out;
}

/** Records the delivery (idempotent on X-GitHub-Delivery) and routes it. Returns false for duplicates. */
export async function handleGithubWebhook(deliveryId: string, event: string, payload: Payload): Promise<"duplicate" | "ok"> {
  const [stored] = await db
    .insert(githubWebhookEvents)
    .values({ deliveryId, event, action: payload.action ?? null, installationId: payload.installation?.id ?? null, githubRepoId: payload.repository?.id ?? null, payload })
    .onConflictDoNothing()
    .returning({ id: githubWebhookEvents.id });
  if (!stored) return "duplicate";

  try {
    await route(event, payload);
    await db.update(githubWebhookEvents).set({ processedAt: new Date() }).where(eq(githubWebhookEvents.id, stored.id));
  } catch (e) {
    await db.update(githubWebhookEvents).set({ error: e instanceof Error ? e.message.slice(0, 500) : "failed" }).where(eq(githubWebhookEvents.id, stored.id));
    throw e;
  }
  return "ok";
}

async function route(event: string, p: Payload) {
  switch (event) {
    case "ping":
      return;
    case "push": {
      const ref: string = p.ref ?? "";
      if (p.deleted || !p.repository) return;
      for (const repo of await connectedRepositoriesByGithubId(p.repository.id)) {
        if (ref !== `refs/heads/${repo.defaultBranch}`) continue;
        const sha: string = p.after;
        // The same exact commit is never analyzed twice (e.g. PR merge + push events).
        const [dup] = await db.select({ id: repositoryAnalyses.id }).from(repositoryAnalyses).where(and(eq(repositoryAnalyses.repositoryId, repo.id), eq(repositoryAnalyses.commitSha, sha), ne(repositoryAnalyses.status, "failed"))).limit(1);
        if (dup) continue;
        await requestAnalysis(repo.id, "push", { sha, branch: repo.defaultBranch });
      }
      return;
    }
    case "pull_request": {
      if (!p.repository) return;
      const pr = p.pull_request;
      const repos = await db.select().from(githubRepositories).where(eq(githubRepositories.githubRepoId, p.repository.id));
      for (const repo of repos) {
        const [row] = await db.select().from(remediationPullRequests).where(and(eq(remediationPullRequests.repositoryId, repo.id), eq(remediationPullRequests.prNumber, pr.number)));
        if (!row) continue;
        if (p.action === "synchronize") {
          await db.update(remediationPullRequests).set({ headSha: pr.head.sha }).where(eq(remediationPullRequests.id, row.id));
        } else if (p.action === "closed" && pr.merged) {
          await db.update(remediationPullRequests).set({ state: "merged", mergeCommitSha: pr.merge_commit_sha }).where(eq(remediationPullRequests.id, row.id));
          const [plan] = await db.select().from(remediationPlans).where(eq(remediationPlans.id, row.planId));
          if (plan) await db.update(securityFindings).set({ status: "pr_merged" }).where(and(eq(securityFindings.repositoryId, repo.id), eq(securityFindings.packageName, plan.packageName), inArray(securityFindings.status, ["pr_created", "fix_available", "open"])));
          await notifyRepository({
            kind: "remediation_pr_merged", severity: "info", category: "remediation", repositoryId: repo.id, dedupeKey: `pr-merged:${row.id}`,
            title: `Remediation PR #${pr.number} merged in ${await repositoryName(repo.id)}`,
            body: "The merged commit will now be re-analyzed. The finding is marked fixed only after the resulting dependency tree is verified.",
            path: "/dashboard/remediation",
          });
          // Analyze the merge commit; if that exact commit is already analyzed/queued, attach verification to it.
          const sha: string = pr.merge_commit_sha;
          const [existing] = await db.select().from(repositoryAnalyses).where(and(eq(repositoryAnalyses.repositoryId, repo.id), eq(repositoryAnalyses.commitSha, sha), ne(repositoryAnalyses.status, "failed"))).limit(1);
          if (!existing) await requestAnalysis(repo.id, "verify", { sha, branch: repo.defaultBranch, verifiesRemediationId: row.id });
          else if (existing.status === "completed") await verifyRemediationFromAnalysis(row.id, existing.id);
          else await db.update(repositoryAnalyses).set({ verifiesRemediationId: row.id }).where(eq(repositoryAnalyses.id, existing.id));
        } else if (p.action === "closed") {
          await db.update(remediationPullRequests).set({ state: "closed" }).where(eq(remediationPullRequests.id, row.id));
        } else if (p.action === "reopened") {
          await db.update(remediationPullRequests).set({ state: "open" }).where(eq(remediationPullRequests.id, row.id));
        }
      }
      return;
    }
    case "check_run":
    case "check_suite":
    case "workflow_run": {
      if (!p.repository) return;
      const repos = await db.select().from(githubRepositories).where(eq(githubRepositories.githubRepoId, p.repository.id));
      for (const repo of repos) await processCiEvent(event, p, repo.id);
      return;
    }
    case "installation": {
      const id = p.installation?.id;
      if (!id) return;
      if (p.action === "deleted") await db.update(githubInstallations).set({ deletedAt: new Date() }).where(eq(githubInstallations.installationId, id));
      else if (p.action === "suspend") await db.update(githubInstallations).set({ suspendedAt: new Date() }).where(eq(githubInstallations.installationId, id));
      else if (p.action === "unsuspend") await db.update(githubInstallations).set({ suspendedAt: null }).where(eq(githubInstallations.installationId, id));
      return;
    }
    case "installation_repositories": {
      const id = p.installation?.id;
      const [row] = id ? await db.select().from(githubInstallations).where(eq(githubInstallations.installationId, id)) : [];
      if (row) {
        await upsertInstallation(row.installationId);
        await syncInstallationRepositories(row.id, row.installationId);
      }
      return;
    }
  }
}
