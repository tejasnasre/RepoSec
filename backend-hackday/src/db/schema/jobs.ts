import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Durable PostgreSQL-backed queue. Claimed with FOR UPDATE SKIP LOCKED. */
export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "dead"] })
      .notNull()
      .default("queued"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    timeoutSeconds: integer("timeout_seconds").notNull().default(900),
    /** Only one *queued* job per key: later events coalesce into it, while a running job may overlap. */
    dedupeKey: text("dedupe_key"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("background_jobs_claim_idx").on(t.status, t.runAt, t.priority),
    uniqueIndex("background_jobs_dedupe_active_uq")
      .on(t.dedupeKey)
      .where(sql`${t.status} = 'queued' and ${t.dedupeKey} is not null`),
  ],
);

export const backgroundJobAttempts = pgTable(
  "background_job_attempts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobId: uuid("job_id")
      .notNull()
      .references(() => backgroundJobs.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    workerId: text("worker_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: text("outcome", { enum: ["succeeded", "failed", "timeout"] }),
    error: text("error"),
  },
  (t) => [index("background_job_attempts_job_idx").on(t.jobId)],
);
