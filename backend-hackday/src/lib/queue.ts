import { sql } from "drizzle-orm";
import { db } from "../db";

export type JobType =
  | "repository.analyze"
  | "notification.email.send"
  | "advisory.refresh";

export type EnqueueInput = {
  type: JobType;
  payload: Record<string, unknown>;
  /** Coalesces with an already-queued job of the same key (payload is replaced: latest wins). */
  dedupeKey?: string;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  timeoutSeconds?: number;
};

export type ClaimedJob = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  timeoutSeconds: number;
};

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] }).rows ?? []));

export async function enqueue(input: EnqueueInput): Promise<{ id: string; coalesced: boolean }> {
  const res = rowsOf(
    await db.execute(sql`
      INSERT INTO background_jobs (type, payload, priority, run_at, max_attempts, timeout_seconds, dedupe_key)
      VALUES (${input.type}, ${JSON.stringify(input.payload)}::jsonb, ${input.priority ?? 0},
              ${(input.runAt ?? new Date()).toISOString()}::timestamptz, ${input.maxAttempts ?? 4},
              ${input.timeoutSeconds ?? 900}, ${input.dedupeKey ?? null})
      ON CONFLICT (dedupe_key) WHERE status = 'queued' AND dedupe_key IS NOT NULL
      DO UPDATE SET payload = EXCLUDED.payload
      RETURNING id, (xmax = 0) AS inserted
    `),
  );
  const row = res[0]!;
  return { id: String(row.id), coalesced: row.inserted === false };
}

export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const res = rowsOf(
    await db.execute(sql`
      UPDATE background_jobs
      SET status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM background_jobs
        WHERE status = 'queued' AND run_at <= now()
        ORDER BY priority DESC, run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, type, payload, attempts, max_attempts, timeout_seconds
    `),
  );
  const r = res[0];
  if (!r) return null;
  const job: ClaimedJob = {
    id: String(r.id),
    type: String(r.type),
    payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    timeoutSeconds: Number(r.timeout_seconds),
  };
  await db.execute(sql`
    INSERT INTO background_job_attempts (job_id, attempt, worker_id) VALUES (${job.id}, ${job.attempts}, ${workerId})
  `);
  return job;
}

export async function completeJob(job: ClaimedJob) {
  await db.execute(sql`UPDATE background_jobs SET status = 'succeeded', finished_at = now(), last_error = NULL WHERE id = ${job.id}`);
  await db.execute(sql`
    UPDATE background_job_attempts SET finished_at = now(), outcome = 'succeeded'
    WHERE job_id = ${job.id} AND attempt = ${job.attempts}
  `);
}

/** Exponential backoff (10s, 20s, 40s... capped at 15 min); dead-letters after maxAttempts. */
export async function failJob(job: ClaimedJob, error: unknown, outcome: "failed" | "timeout" = "failed") {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const dead = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(10 * 2 ** (job.attempts - 1), 900);
  await db.execute(sql`
    UPDATE background_jobs
    SET status = ${dead ? "dead" : "queued"},
        last_error = ${message},
        locked_at = NULL, locked_by = NULL,
        run_at = now() + (${delaySeconds} || ' seconds')::interval,
        finished_at = ${dead ? sql`now()` : sql`NULL`}
    WHERE id = ${job.id}
  `);
  await db.execute(sql`
    UPDATE background_job_attempts SET finished_at = now(), outcome = ${outcome}, error = ${message}
    WHERE job_id = ${job.id} AND attempt = ${job.attempts}
  `);
  return { dead };
}

/** Re-queues jobs whose worker vanished (lock older than 1.5x their timeout). */
export async function reapStaleJobs() {
  await db.execute(sql`
    UPDATE background_jobs
    SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
        last_error = 'worker lost (stale lock)', locked_at = NULL, locked_by = NULL,
        finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
    WHERE status = 'running' AND locked_at < now() - (timeout_seconds * 1.5 || ' seconds')::interval
  `);
}

export async function queueStats() {
  return rowsOf(await db.execute(sql`SELECT status, count(*)::int AS count FROM background_jobs GROUP BY status`));
}
