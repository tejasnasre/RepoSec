import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { githubRepositories } from "./github";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Exact commit snapshots we have seen/analyzed. Never overwritten. */
export const repositoryCommits = pgTable(
  "repository_commits",
  {
    id: id(),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    branch: text("branch").notNull(),
    message: text("message"),
    authoredAt: ts("authored_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repository_commits_repo_sha_uq").on(t.repositoryId, t.sha)],
);

export const analysisStageNames = [
  "connecting_repository",
  "fetching_latest_commit",
  "extracting_dependencies",
  "fetching_package_metadata",
  "checking_vulnerabilities",
  "researching_advisories",
  "investigating_packages",
  "generating_report",
  "sending_notifications",
] as const;

export const repositoryAnalyses = pgTable(
  "repository_analyses",
  {
    id: id(),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha"),
    branch: text("branch"),
    trigger: text("trigger", { enum: ["connect", "manual", "push", "advisory_refresh", "verify"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] }).notNull().default("queued"),
    currentStage: text("current_stage"),
    error: text("error"),
    jobId: uuid("job_id"),
    /** Remediation PR whose merge this analysis verifies, if any. */
    verifiesRemediationId: uuid("verifies_remediation_id"),
    totals: jsonb("totals").$type<Record<string, number>>().notNull().default({}),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("repository_analyses_repo_idx").on(t.repositoryId, t.createdAt)],
);

export const analysisStages = pgTable(
  "analysis_stages",
  {
    id: id(),
    analysisId: uuid("analysis_id").notNull().references(() => repositoryAnalyses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status", { enum: ["pending", "running", "succeeded", "failed", "skipped"] }).notNull().default("pending"),
    detail: text("detail"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [uniqueIndex("analysis_stages_uq").on(t.analysisId, t.name)],
);

/** Registry-level cache per package. */
export const packages = pgTable(
  "packages",
  {
    id: id(),
    ecosystem: text("ecosystem").notNull().default("npm"),
    name: text("name").notNull(),
    latestVersion: text("latest_version"),
    latestPublishedAt: ts("latest_published_at"),
    repositoryUrl: text("repository_url"),
    homepage: text("homepage"),
    deprecatedMessage: text("deprecated_message"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("packages_eco_name_uq").on(t.ecosystem, t.name)],
);

/** Dependency inventory of one analysis (one row per resolved package version per lockfile). */
export const repositoryDependencies = pgTable(
  "repository_dependencies",
  {
    id: id(),
    analysisId: uuid("analysis_id").notNull().references(() => repositoryAnalyses.id, { onDelete: "cascade" }),
    ecosystem: text("ecosystem").notNull().default("npm"),
    name: text("name").notNull(),
    declaredRange: text("declared_range"),
    installedVersion: text("installed_version"),
    isDirect: boolean("is_direct").notNull(),
    isDev: boolean("is_dev").notNull().default(false),
    isPeer: boolean("is_peer").notNull().default(false),
    isOptional: boolean("is_optional").notNull().default(false),
    /** e.g. ["next", "react-dom", "scheduler"] (root first, this package last). */
    dependencyPath: jsonb("dependency_path").$type<string[]>().notNull().default([]),
    lockfile: text("lockfile"),
    manifestPath: text("manifest_path"),
    registry: text("registry").default("https://registry.npmjs.org"),
    latestVersion: text("latest_version"),
    latestStableVersion: text("latest_stable_version"),
    latestCompatibleVersion: text("latest_compatible_version"),
    isOutdated: boolean("is_outdated").notNull().default(false),
    isDeprecated: boolean("is_deprecated").notNull().default(false),
    deprecatedMessage: text("deprecated_message"),
  },
  (t) => [index("repository_dependencies_analysis_idx").on(t.analysisId), index("repository_dependencies_name_idx").on(t.name)],
);

/** Deduplicated advisory records (OSV/GHSA/CVE merged by aliases). */
export const vulnerabilities = pgTable(
  "vulnerabilities",
  {
    id: id(),
    /** Canonical id: GHSA if present, else CVE, else OSV id. */
    canonicalId: text("canonical_id").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    osvIds: jsonb("osv_ids").$type<string[]>().notNull().default([]),
    ghsaId: text("ghsa_id"),
    cveId: text("cve_id"),
    isMalicious: boolean("is_malicious").notNull().default(false),
    summary: text("summary"),
    details: text("details"),
    severity: text("severity", { enum: ["critical", "high", "medium", "low", "informational", "unknown"] }).notNull().default("unknown"),
    severitySource: text("severity_source"),
    cvssScore: doublePrecision("cvss_score"),
    cvssVector: text("cvss_vector"),
    cwes: jsonb("cwes").$type<string[]>().notNull().default([]),
    publishedAt: ts("published_at"),
    modifiedAt: ts("modified_at"),
    references: jsonb("references").$type<{ type: string; url: string; source: string }[]>().notNull().default([]),
    /** [{ package, ecosystem, ranges: [{type, events}] }] as published. */
    affected: jsonb("affected").$type<unknown[]>().notNull().default([]),
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vulnerabilities_canonical_uq").on(t.canonicalId)],
);

export const findingClassifications = [
  "known_vulnerability",
  "potentially_vulnerable",
  "malicious_package",
  "compromised_release",
  "deprecated_package",
  "suspicious_package",
] as const;

export const findingStatuses = [
  "open",
  "investigating",
  "fix_available",
  "pr_created",
  "pr_merged",
  "fix_verified",
  "fix_partially_verified",
  "still_vulnerable",
  "false_positive",
  "accepted_risk",
  "closed",
] as const;

export const securityFindings = pgTable(
  "security_findings",
  {
    id: id(),
    analysisId: uuid("analysis_id").notNull().references(() => repositoryAnalyses.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    dependencyId: uuid("dependency_id").notNull().references(() => repositoryDependencies.id, { onDelete: "cascade" }),
    vulnerabilityId: uuid("vulnerability_id").references(() => vulnerabilities.id, { onDelete: "set null" }),
    /** Stable across analyses: repo + package + advisory (or classification). */
    findingKey: text("finding_key").notNull(),
    classification: text("classification", { enum: findingClassifications }).notNull(),
    severity: text("severity", { enum: ["critical", "high", "medium", "low", "informational", "unknown"] }).notNull().default("unknown"),
    status: text("status", { enum: findingStatuses }).notNull().default("open"),
    packageName: text("package_name").notNull(),
    installedVersion: text("installed_version").notNull(),
    patchedVersion: text("patched_version"),
    latestVersion: text("latest_version"),
    isDirect: boolean("is_direct").notNull(),
    /** false = affected version present, usage not established. Never claim exploitable from this alone. */
    reachability: text("reachability", { enum: ["verified", "not_found", "unknown"] }).notNull().default("unknown"),
    commitSha: text("commit_sha"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("security_findings_analysis_idx").on(t.analysisId),
    index("security_findings_repo_key_idx").on(t.repositoryId, t.findingKey),
  ],
);
