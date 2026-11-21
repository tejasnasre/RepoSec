import { and, eq, or } from "drizzle-orm";
import { db } from "../db";
import { ciChecks, ciRuns, remediationPullRequests } from "../db/schema";
import { notifyRepository, repositoryName } from "./notifications";

type Payload = Record<string, any>;

async function findRemediationPr(repositoryId: string, sha: string, prNumbers: number[]) {
  const conds = [eq(remediationPullRequests.headSha, sha), ...prNumbers.map((n) => eq(remediationPullRequests.prNumber, n))];
  const [pr] = await db
    .select()
    .from(remediationPullRequests)
    .where(and(eq(remediationPullRequests.repositoryId, repositoryId), or(...conds)))
    .limit(1);
  return pr ?? null;
}

/** Correlates check_run / check_suite / workflow_run with repository, commit SHA and remediation PR. */
export async function processCiEvent(event: "check_run" | "check_suite" | "workflow_run", payload: Payload, repositoryId: string) {
  const obj = payload[event] as Payload;
  if (!obj) return;
  const sha: string = obj.head_sha;
  const prNumbers: number[] = (obj.pull_requests ?? []).map((p: Payload) => p.number).filter(Boolean);
  const pr = await findRemediationPr(repositoryId, sha, prNumbers);

  if (event === "check_run") {
    await db
      .insert(ciChecks)
      .values({
        repositoryId,
        commitSha: sha,
        externalId: `cr:${obj.id}`,
        name: obj.name,
        status: obj.status,
        conclusion: obj.conclusion ?? null,
        url: obj.html_url ?? null,
        summary: (obj.output?.summary ?? obj.output?.title ?? null)?.slice(0, 2000) ?? null,
      })
      .onConflictDoUpdate({
        target: [ciChecks.repositoryId, ciChecks.externalId],
        set: { status: obj.status, conclusion: obj.conclusion ?? null, summary: (obj.output?.summary ?? obj.output?.title ?? null)?.slice(0, 2000) ?? null, updatedAt: new Date() },
      });
    return;
  }

  const externalId = event === "workflow_run" ? `wf:${obj.id}` : `cs:${obj.id}`;
  const name: string = event === "workflow_run" ? obj.name : (obj.app?.name ?? "check suite");
  const values = {
    repositoryId,
    commitSha: sha,
    prNumber: prNumbers[0] ?? pr?.prNumber ?? null,
    remediationPullRequestId: pr?.id ?? null,
    externalId,
    name,
    status: obj.status as string,
    conclusion: (obj.conclusion as string | null) ?? null,
    url: (obj.html_url as string | undefined) ?? null,
  };
  await db.insert(ciRuns).values(values).onConflictDoUpdate({ target: [ciRuns.repositoryId, ciRuns.externalId], set: { ...values, updatedAt: new Date() } });

  // Notify only for completed runs tied to a remediation PR; never claim the fix is verified from CI.
  if (event === "workflow_run" && pr && obj.status === "completed") {
    const failed = obj.conclusion === "failure" || obj.conclusion === "timed_out" || obj.conclusion === "cancelled";
    const repo = await repositoryName(repositoryId);
    await notifyRepository({
      kind: failed ? "ci_failed" : "ci_completed",
      severity: failed ? "medium" : "low",
      category: "ci",
      repositoryId,
      dedupeKey: `ci:${externalId}:${obj.conclusion}`,
      title: `CI ${failed ? "failed" : "completed"}: ${name} on PR #${pr.prNumber} (${repo})`,
      body: `Workflow "${name}" concluded: ${obj.conclusion}.\nCI is separate from security verification: ${failed ? "this failure is not automatically attributed to the security fix." : "a passing CI run does not prove the vulnerability is resolved."}`,
      path: `/dashboard/remediation`,
    });
  }
}
