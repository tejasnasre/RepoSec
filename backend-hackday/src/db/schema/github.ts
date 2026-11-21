import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** One row per GitHub App installation (a user or org account). */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: id(),
    /** GitHub's numeric installation id. */
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    accountId: bigint("account_id", { mode: "number" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type", { enum: ["User", "Organization"] }).notNull(),
    accountAvatarUrl: text("account_avatar_url"),
    repositorySelection: text("repository_selection", { enum: ["all", "selected"] }).notNull(),
    /** Permissions granted to the installation, as reported by GitHub. */
    permissions: jsonb("permissions").$type<Record<string, string>>().notNull().default({}),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    /** Set when the app is uninstalled; rows are kept for history. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("github_installations_installation_id_uq").on(t.installationId)],
);

/**
 * Which application users may use an installation. A row is only created after we
 * verify, with the user's own GitHub token, that they can access that installation.
 */
export const githubInstallationUsers = pgTable(
  "github_installation_users",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationRowId: uuid("installation_row_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("github_installation_users_uq").on(t.userId, t.installationRowId),
    index("github_installation_users_installation_idx").on(t.installationRowId),
  ],
);

/** Repositories visible to an installation. Mirrors GitHub; refreshed on install/webhook events. */
export const githubRepositories = pgTable(
  "github_repositories",
  {
    id: id(),
    installationRowId: uuid("installation_row_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    /** GitHub's numeric repository id (stable across renames and transfers). */
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    description: text("description"),
    isPrivate: boolean("is_private").notNull(),
    defaultBranch: text("default_branch").notNull(),
    primaryLanguage: text("primary_language"),
    htmlUrl: text("html_url").notNull(),
    archived: boolean("archived").notNull().default(false),
    /** No longer accessible to the installation (removed or uninstalled). */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("github_repositories_installation_repo_uq").on(t.installationRowId, t.githubRepoId),
    index("github_repositories_github_repo_id_idx").on(t.githubRepoId),
  ],
);

/** A user's choice to monitor a repository ("connected"). Authorization checks start here. */
export const githubRepositoryMemberships = pgTable(
  "github_repository_memberships",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => githubRepositories.id, { onDelete: "cascade" }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    /** Disconnected repos keep their history. */
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("github_repository_memberships_uq").on(t.userId, t.repositoryId),
    index("github_repository_memberships_repo_idx").on(t.repositoryId),
  ],
);

/** Raw inbound webhook deliveries. `deliveryId` (X-GitHub-Delivery) makes processing idempotent. */
export const githubWebhookEvents = pgTable(
  "github_webhook_events",
  {
    id: id(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    action: text("action"),
    installationId: bigint("installation_id", { mode: "number" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("github_webhook_events_delivery_uq").on(t.deliveryId),
    index("github_webhook_events_repo_idx").on(t.githubRepoId),
  ],
);

export const githubInstallationsRelations = relations(githubInstallations, ({ many }) => ({
  users: many(githubInstallationUsers),
  repositories: many(githubRepositories),
}));

export const githubInstallationUsersRelations = relations(githubInstallationUsers, ({ one }) => ({
  user: one(user, { fields: [githubInstallationUsers.userId], references: [user.id] }),
  installation: one(githubInstallations, {
    fields: [githubInstallationUsers.installationRowId],
    references: [githubInstallations.id],
  }),
}));

export const githubRepositoriesRelations = relations(githubRepositories, ({ one, many }) => ({
  installation: one(githubInstallations, {
    fields: [githubRepositories.installationRowId],
    references: [githubInstallations.id],
  }),
  memberships: many(githubRepositoryMemberships),
}));

export const githubRepositoryMembershipsRelations = relations(githubRepositoryMemberships, ({ one }) => ({
  user: one(user, { fields: [githubRepositoryMemberships.userId], references: [user.id] }),
  repository: one(githubRepositories, {
    fields: [githubRepositoryMemberships.repositoryId],
    references: [githubRepositories.id],
  }),
}));
