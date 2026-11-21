CREATE TABLE "analysis_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detail" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem" text DEFAULT 'npm' NOT NULL,
	"name" text NOT NULL,
	"latest_version" text,
	"latest_published_at" timestamp with time zone,
	"repository_url" text,
	"homepage" text,
	"deprecated_message" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"commit_sha" text,
	"branch" text,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_stage" text,
	"error" text,
	"job_id" uuid,
	"verifies_remediation_id" uuid,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"branch" text NOT NULL,
	"message" text,
	"authored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"ecosystem" text DEFAULT 'npm' NOT NULL,
	"name" text NOT NULL,
	"declared_range" text,
	"installed_version" text,
	"is_direct" boolean NOT NULL,
	"is_dev" boolean DEFAULT false NOT NULL,
	"is_peer" boolean DEFAULT false NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"dependency_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lockfile" text,
	"manifest_path" text,
	"registry" text DEFAULT 'https://registry.npmjs.org',
	"latest_version" text,
	"latest_stable_version" text,
	"latest_compatible_version" text,
	"is_outdated" boolean DEFAULT false NOT NULL,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"deprecated_message" text
);
--> statement-breakpoint
CREATE TABLE "security_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"dependency_id" uuid NOT NULL,
	"vulnerability_id" uuid,
	"finding_key" text NOT NULL,
	"classification" text NOT NULL,
	"severity" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"package_name" text NOT NULL,
	"installed_version" text NOT NULL,
	"patched_version" text,
	"latest_version" text,
	"is_direct" boolean NOT NULL,
	"reachability" text DEFAULT 'unknown' NOT NULL,
	"commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vulnerabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_id" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"osv_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ghsa_id" text,
	"cve_id" text,
	"is_malicious" boolean DEFAULT false NOT NULL,
	"summary" text,
	"details" text,
	"severity" text DEFAULT 'unknown' NOT NULL,
	"severity_source" text,
	"cvss_score" double precision,
	"cvss_vector" text,
	"cwes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"modified_at" timestamp with time zone,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"worker_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 4 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"timeout_seconds" integer DEFAULT 900 NOT NULL,
	"dedupe_key" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ci_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ci_run_id" uuid,
	"repository_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"url" text,
	"summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ci_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"pr_number" integer,
	"remediation_pull_request_id" uuid,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"evidence" text NOT NULL,
	"source_url" text,
	"source_type" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"executive_summary" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb,
	"output_summary" text,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"dependency_id" uuid,
	"package_name" text NOT NULL,
	"installed_version" text NOT NULL,
	"commit_sha" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"model" text,
	"priority" text,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"current_version" text NOT NULL,
	"target_version" text,
	"is_direct" boolean NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"created_by_user_id" text,
	"branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"base_sha" text NOT NULL,
	"head_sha" text,
	"pr_number" integer,
	"pr_url" text,
	"state" text DEFAULT 'creating' NOT NULL,
	"merge_commit_sha" text,
	"verification" text DEFAULT 'pending' NOT NULL,
	"verification_detail" jsonb,
	"validation" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"user_id" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"min_severity" text DEFAULT 'high' NOT NULL,
	"analysis_completed" boolean DEFAULT true NOT NULL,
	"remediation_events" boolean DEFAULT true NOT NULL,
	"ci_events" boolean DEFAULT true NOT NULL,
	"digest_low_priority" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"repository_id" uuid,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_stages" ADD CONSTRAINT "analysis_stages_analysis_id_repository_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."repository_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_analyses" ADD CONSTRAINT "repository_analyses_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_commits" ADD CONSTRAINT "repository_commits_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_dependencies" ADD CONSTRAINT "repository_dependencies_analysis_id_repository_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."repository_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_analysis_id_repository_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."repository_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_dependency_id_repository_dependencies_id_fk" FOREIGN KEY ("dependency_id") REFERENCES "public"."repository_dependencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_vulnerability_id_vulnerabilities_id_fk" FOREIGN KEY ("vulnerability_id") REFERENCES "public"."vulnerabilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_job_attempts" ADD CONSTRAINT "background_job_attempts_job_id_background_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."background_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_checks" ADD CONSTRAINT "ci_checks_ci_run_id_ci_runs_id_fk" FOREIGN KEY ("ci_run_id") REFERENCES "public"."ci_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_checks" ADD CONSTRAINT "ci_checks_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_remediation_pull_request_id_remediation_pull_requests_id_fk" FOREIGN KEY ("remediation_pull_request_id") REFERENCES "public"."remediation_pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_evidence" ADD CONSTRAINT "investigation_evidence_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_reports" ADD CONSTRAINT "investigation_reports_analysis_id_repository_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."repository_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_reports" ADD CONSTRAINT "investigation_reports_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_steps" ADD CONSTRAINT "investigation_steps_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_analysis_id_repository_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."repository_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_dependency_id_repository_dependencies_id_fk" FOREIGN KEY ("dependency_id") REFERENCES "public"."repository_dependencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_pull_requests" ADD CONSTRAINT "remediation_pull_requests_plan_id_remediation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."remediation_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_pull_requests" ADD CONSTRAINT "remediation_pull_requests_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_pull_requests" ADD CONSTRAINT "remediation_pull_requests_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_stages_uq" ON "analysis_stages" USING btree ("analysis_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "packages_eco_name_uq" ON "packages" USING btree ("ecosystem","name");--> statement-breakpoint
CREATE INDEX "repository_analyses_repo_idx" ON "repository_analyses" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_commits_repo_sha_uq" ON "repository_commits" USING btree ("repository_id","sha");--> statement-breakpoint
CREATE INDEX "repository_dependencies_analysis_idx" ON "repository_dependencies" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "repository_dependencies_name_idx" ON "repository_dependencies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "security_findings_analysis_idx" ON "security_findings" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "security_findings_repo_key_idx" ON "security_findings" USING btree ("repository_id","finding_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vulnerabilities_canonical_uq" ON "vulnerabilities" USING btree ("canonical_id");--> statement-breakpoint
CREATE INDEX "background_job_attempts_job_idx" ON "background_job_attempts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "background_jobs_claim_idx" ON "background_jobs" USING btree ("status","run_at","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_dedupe_active_uq" ON "background_jobs" USING btree ("dedupe_key") WHERE "background_jobs"."status" in ('queued','running') and "background_jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_checks_external_uq" ON "ci_checks" USING btree ("repository_id","external_id");--> statement-breakpoint
CREATE INDEX "ci_checks_sha_idx" ON "ci_checks" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_external_uq" ON "ci_runs" USING btree ("repository_id","external_id");--> statement-breakpoint
CREATE INDEX "ci_runs_sha_idx" ON "ci_runs" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE INDEX "investigation_evidence_inv_idx" ON "investigation_evidence" USING btree ("investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_reports_analysis_uq" ON "investigation_reports" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "investigation_steps_inv_idx" ON "investigation_steps" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "investigations_analysis_idx" ON "investigations" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "investigations_repo_idx" ON "investigations" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "remediation_plans_investigation_uq" ON "remediation_plans" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "remediation_pull_requests_repo_idx" ON "remediation_pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "remediation_pull_requests_pr_idx" ON "remediation_pull_requests" USING btree ("repository_id","pr_number");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_user_idx" ON "email_delivery_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");