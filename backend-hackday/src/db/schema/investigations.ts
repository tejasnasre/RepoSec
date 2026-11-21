import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { githubRepositories } from "./github";
import { repositoryAnalyses, repositoryDependencies, securityFindings } from "./analysis";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** One investigation per affected package version in an analysis (covers all its advisories). */
export const investigations = pgTable(
  "investigations",
  {
    id: id(),
    analysisId: uuid("analysis_id").notNull().references(() => repositoryAnalyses.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    dependencyId: uuid("dependency_id").references(() => repositoryDependencies.id, { onDelete: "set null" }),
    packageName: text("package_name").notNull(),
    installedVersion: text("installed_version").notNull(),
    commitSha: text("commit_sha"),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] }).notNull().default("queued"),
    model: text("model"),
    priority: text("priority", { enum: ["critical", "high", "medium", "low"] }),
    /** Structured result (see InvestigationResult). */
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("investigations_analysis_idx").on(t.analysisId), index("investigations_repo_idx").on(t.repositoryId, t.createdAt)],
);

export const investigationSteps = pgTable(
  "investigation_steps",
  {
    id: id(),
    investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["tool_call", "model"] }).notNull(),
    name: text("name").notNull(),
    input: jsonb("input"),
    outputSummary: text("output_summary"),
    ok: boolean("ok").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("investigation_steps_inv_idx").on(t.investigationId)],
);

export const investigationEvidence = pgTable(
  "investigation_evidence",
  {
    id: id(),
    investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    evidence: text("evidence").notNull(),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", { enum: ["official", "advisory_database", "package_registry", "repository", "community", "unknown"] }).notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    /** confirmed = backed by an authoritative source/tool result; inferred = model reasoning. */
    status: text("status", { enum: ["confirmed", "inferred"] }).notNull(),
    retrievedAt: ts("retrieved_at").notNull().defaultNow(),
  },
  (t) => [index("investigation_evidence_inv_idx").on(t.investigationId)],
);

export const investigationReports = pgTable(
  "investigation_reports",
  {
    id: id(),
    analysisId: uuid("analysis_id").notNull().references(() => repositoryAnalyses.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    executiveSummary: text("executive_summary").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("investigation_reports_analysis_uq").on(t.analysisId)],
);

export const remediationPlans = pgTable(
  "remediation_plans",
  {
    id: id(),
    investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    packageName: text("package_name").notNull(),
    currentVersion: text("current_version").notNull(),
    targetVersion: text("target_version"),
    isDirect: boolean("is_direct").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("remediation_plans_investigation_uq").on(t.investigationId)],
);

export const remediationPullRequests = pgTable(
  "remediation_pull_requests",
  {
    id: id(),
    planId: uuid("plan_id").notNull().references(() => remediationPlans.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    branch: text("branch").notNull(),
    baseBranch: text("base_branch").notNull(),
    baseSha: text("base_sha").notNull(),
    headSha: text("head_sha"),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    state: text("state", { enum: ["creating", "open", "merged", "closed", "failed"] }).notNull().default("creating"),
    mergeCommitSha: text("merge_commit_sha"),
    /** Separate from CI: did the resulting lockfile stop resolving the vulnerable version? */
    verification: text("verification", { enum: ["pending", "fix_verified", "fix_partially_verified", "still_vulnerable"] }).notNull().default("pending"),
    verificationDetail: jsonb("verification_detail").$type<Record<string, unknown>>(),
    validation: jsonb("validation").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("remediation_pull_requests_repo_idx").on(t.repositoryId), index("remediation_pull_requests_pr_idx").on(t.repositoryId, t.prNumber)],
);

export const ciRuns = pgTable(
  "ci_runs",
  {
    id: id(),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    prNumber: integer("pr_number"),
    remediationPullRequestId: uuid("remediation_pull_request_id").references(() => remediationPullRequests.id, { onDelete: "set null" }),
    /** GitHub workflow run / check suite id. */
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    url: text("url"),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("ci_runs_external_uq").on(t.repositoryId, t.externalId), index("ci_runs_sha_idx").on(t.repositoryId, t.commitSha)],
);

export const ciChecks = pgTable(
  "ci_checks",
  {
    id: id(),
    ciRunId: uuid("ci_run_id").references(() => ciRuns.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    url: text("url"),
    summary: text("summary"),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("ci_checks_external_uq").on(t.repositoryId, t.externalId), index("ci_checks_sha_idx").on(t.repositoryId, t.commitSha)],
);
