CREATE TABLE "github_installation_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"installation_row_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_avatar_url" text,
	"repository_selection" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_row_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"is_private" boolean NOT NULL,
	"default_branch" text NOT NULL,
	"primary_language" text,
	"html_url" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repository_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "github_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"installation_id" bigint,
	"github_repo_id" bigint,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "github_installation_users" ADD CONSTRAINT "github_installation_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installation_users" ADD CONSTRAINT "github_installation_users_installation_row_id_github_installations_id_fk" FOREIGN KEY ("installation_row_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation_row_id_github_installations_id_fk" FOREIGN KEY ("installation_row_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_memberships" ADD CONSTRAINT "github_repository_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_memberships" ADD CONSTRAINT "github_repository_memberships_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installation_users_uq" ON "github_installation_users" USING btree ("user_id","installation_row_id");--> statement-breakpoint
CREATE INDEX "github_installation_users_installation_idx" ON "github_installation_users" USING btree ("installation_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_installation_id_uq" ON "github_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_installation_repo_uq" ON "github_repositories" USING btree ("installation_row_id","github_repo_id");--> statement-breakpoint
CREATE INDEX "github_repositories_github_repo_id_idx" ON "github_repositories" USING btree ("github_repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repository_memberships_uq" ON "github_repository_memberships" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "github_repository_memberships_repo_idx" ON "github_repository_memberships" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_webhook_events_delivery_uq" ON "github_webhook_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "github_webhook_events_repo_idx" ON "github_webhook_events" USING btree ("github_repo_id");