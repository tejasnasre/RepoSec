import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  /** Only email for findings at or above this severity. */
  minSeverity: text("min_severity", { enum: ["critical", "high", "medium", "low"] }).notNull().default("high"),
  analysisCompleted: boolean("analysis_completed").notNull().default(true),
  remediationEvents: boolean("remediation_events").notNull().default(true),
  ciEvents: boolean("ci_events").notNull().default(true),
  /** Batch low-priority items into one digest instead of one email each. */
  digestLowPriority: boolean("digest_low_priority").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity", { enum: ["critical", "high", "medium", "low", "info"] }).notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    repositoryId: uuid("repository_id"),
    /** Prevents duplicate notifications for the same event. */
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey), index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const emailDeliveryLogs = pgTable(
  "email_delivery_logs",
  {
    id: id(),
    notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    status: text("status", { enum: ["queued", "sent", "failed", "skipped"] }).notNull().default("queued"),
    provider: text("provider").notNull().default("resend"),
    providerMessageId: text("provider_message_id"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    meta: jsonb("meta"),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("email_delivery_logs_user_idx").on(t.userId, t.createdAt)],
);

/** Append-only record of security-relevant user actions. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt)],
);
