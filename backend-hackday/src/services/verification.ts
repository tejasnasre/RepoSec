import { and, eq, like } from "drizzle-orm";
import semver from "semver";
import { db } from "../db";
import { remediationPlans, remediationPullRequests, repositoryDependencies, securityFindings } from "../db/schema";
import { notifyRepository, repositoryName } from "./notifications";

/**
 * After a remediation PR is merged the *resulting dependency tree* is checked. "Merged" or "CI green"
 * never marks a finding fixed on their own.
 */
export async function verifyRemediationFromAnalysis(remediationPrId: string, analysisId: string) {
  const [pr] = await db.select().from(remediationPullRequests).where(eq(remediationPullRequests.id, remediationPrId));
  if (!pr) return;
  const [plan] = await db.select().from(remediationPlans).where(eq(remediationPlans.id, pr.planId));
  if (!plan) return;

  const deps = await db
    .select()
    .from(repositoryDependencies)
    .where(and(eq(repositoryDependencies.analysisId, analysisId), eq(repositoryDependencies.name, plan.packageName)));
  const remaining = await db
    .select()
    .from(securityFindings)
    .where(and(eq(securityFindings.analysisId, analysisId), eq(securityFindings.packageName, plan.packageName)));
  const remainingVulns = remaining.filter((f) => f.classification === "known_vulnerability" || f.classification === "malicious_package");

  const versionsNow = deps.map((d) => d.installedVersion).filter((v): v is string => !!v);
  const vulnerableStillResolved = versionsNow.includes(plan.currentVersion);
  const target = plan.targetVersion;
  const patchedInstalled = !!target && versionsNow.length > 0 && versionsNow.every((v) => semver.valid(v) && semver.gte(v, target));

  let verification: "fix_verified" | "fix_partially_verified" | "still_vulnerable";
  if (deps.length === 0) verification = "fix_verified"; // package no longer in the tree
  else if (vulnerableStillResolved && remainingVulns.length > 0) verification = "still_vulnerable";
  else if (remainingVulns.length === 0 && (patchedInstalled || !vulnerableStillResolved)) verification = "fix_verified";
  else verification = "fix_partially_verified";

  const detail = {
    packageStillInTree: deps.length > 0,
    versionsNow,
    originalVersion: plan.currentVersion,
    originalVersionStillResolved: vulnerableStillResolved,
    targetVersion: target,
    patchedVersionInstalledEverywhere: patchedInstalled,
    remainingFindings: remainingVulns.map((f) => ({ package: f.packageName, version: f.installedVersion, severity: f.severity })),
    verifiedAgainstAnalysis: analysisId,
    note: "Security verification is based on the lockfile of the merged commit. CI status is tracked separately and is not proof that the vulnerability is resolved.",
  };

  await db.update(remediationPullRequests).set({ verification, verificationDetail: detail }).where(eq(remediationPullRequests.id, remediationPrId));

  const status = verification === "fix_verified" ? "fix_verified" : verification === "fix_partially_verified" ? "fix_partially_verified" : "still_vulnerable";
  const keyPrefix = `${pr.repositoryId}:${plan.packageName}:%`;
  await db.update(securityFindings).set({ status }).where(and(eq(securityFindings.repositoryId, pr.repositoryId), like(securityFindings.findingKey, keyPrefix), eq(securityFindings.status, "pr_merged")));
  await db.update(securityFindings).set({ status }).where(and(eq(securityFindings.analysisId, analysisId), eq(securityFindings.packageName, plan.packageName)));

  const name = await repositoryName(pr.repositoryId);
  await notifyRepository({
    kind: "fix_verification",
    severity: verification === "fix_verified" ? "info" : "high",
    category: "remediation",
    repositoryId: pr.repositoryId,
    dedupeKey: `verify:${remediationPrId}:${verification}`,
    title: `Fix ${verification === "fix_verified" ? "verified" : verification === "fix_partially_verified" ? "partially verified" : "NOT verified"}: ${plan.packageName} in ${name}`,
    body: verification === "fix_verified"
      ? `${plan.packageName} no longer resolves to a vulnerable version in the merged lockfile${target ? ` (target ${target})` : ""}.`
      : `After the merge, ${plan.packageName} resolves to ${versionsNow.join(", ") || "nothing"}. ${remainingVulns.length} finding(s) remain.`,
    path: `/dashboard/remediation`,
  });
}
