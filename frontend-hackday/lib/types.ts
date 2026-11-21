import type { Repository } from "@/lib/github-types";

export type Severity = "critical" | "high" | "medium" | "low" | "informational" | "unknown";

export type Totals = {
  dependencies: number; direct: number; outdated: number; vulnerabilities: number;
  critical: number; high: number; medium: number; low: number; malicious: number; deprecated: number;
};

export type AnalysisSummary = {
  id: string; status: "queued" | "running" | "completed" | "failed"; currentStage: string | null;
  createdAt: string; completedAt: string | null;
};

export type ConnectedRepository = Repository & {
  latestCommitSha: string | null; lastAnalyzedCommit: string | null;
  analysis: AnalysisSummary | null; totals: Totals | null;
};

export type Analysis = AnalysisSummary & {
  repositoryId: string; commitSha: string | null; branch: string | null;
  trigger: "connect" | "manual" | "push" | "advisory_refresh" | "verify"; error: string | null;
  totals: Totals | Record<string, never>; startedAt: string | null;
};

export type Stage = { id: string; name: string; position: number; status: "pending" | "running" | "succeeded" | "failed" | "skipped"; detail: string | null };

export type Finding = {
  id: string; repository: string; repositoryId: string; classification: string; severity: Severity; status: string;
  package: string; installedVersion: string; patchedVersion: string | null; latestVersion: string | null;
  isDirect: boolean; reachability: "verified" | "not_found" | "unknown"; dependencyPath: string[]; commitSha: string | null;
  advisory: string | null; ghsaId: string | null; cveId: string | null; summary: string | null; cvssScore: number | null;
  investigationId: string | null;
};

export type Dependency = {
  id: string; name: string; declaredRange: string | null; installedVersion: string | null; isDirect: boolean; isDev: boolean;
  isPeer: boolean; isOptional: boolean; dependencyPath: string[]; lockfile: string | null; latestVersion: string | null;
  latestStableVersion: string | null; latestCompatibleVersion: string | null; isOutdated: boolean; isDeprecated: boolean;
  hasVulnerability: boolean;
};

export type EvidenceItem = {
  id: string; claim: string; evidence: string; sourceUrl: string | null;
  sourceType: "official" | "advisory_database" | "package_registry" | "repository" | "community" | "unknown";
  confidence: "high" | "medium" | "low"; status: "confirmed" | "inferred"; retrievedAt: string;
};

export type PullRequestRow = {
  id: string; repository: string; repositoryId: string; package: string; from: string; to: string | null;
  prNumber: number | null; prUrl: string | null; branch: string; state: "creating" | "open" | "merged" | "closed" | "failed";
  verification: "pending" | "fix_verified" | "fix_partially_verified" | "still_vulnerable";
  verificationDetail: Record<string, unknown> | null; validation: Record<string, unknown> | null; error: string | null; createdAt: string; planId: string;
  ci: { total: number; failed: number; pending: number; passed: number; runs: CiItem[]; checks: (CiItem & { summary: string | null })[] };
};
export type CiItem = { name: string; status: string; conclusion: string | null; url: string | null };

export type NotificationRow = { id: string; kind: string; severity: "critical" | "high" | "medium" | "low" | "info"; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export type Preferences = {
  emailEnabled: boolean; minSeverity: "critical" | "high" | "medium" | "low"; analysisCompleted: boolean;
  remediationEvents: boolean; ciEvents: boolean; digestLowPriority: boolean;
};
