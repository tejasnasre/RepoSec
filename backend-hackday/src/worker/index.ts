import { hostname } from "node:os";
import { isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { githubRepositoryMemberships } from "../db/schema";
import { claimJob, completeJob, enqueue, failJob, queueStats, reapStaleJobs, type ClaimedJob } from "../lib/queue";
import { refreshAdvisoriesForRepository, runAnalysis } from "../services/analysis";
import { sendEmail } from "../services/email";

const workerId = `${hostname()}-${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const POLL_MS = 1500;

type Handler = (payload: Record<string, any>, job: ClaimedJob) => Promise<void>;

const handlers: Record<string, Handler> = {
  "repository.analyze": async (p) => runAnalysis(String(p.analysisId)),

  "notification.email.send": async (p) => {
    await sendEmail(String(p.logId), String(p.to), String(p.subject), String(p.html));
  },

  "advisory.refresh": async () => {
    const rows = await db.selectDistinct({ repositoryId: githubRepositoryMemberships.repositoryId }).from(githubRepositoryMemberships).where(isNull(githubRepositoryMemberships.disconnectedAt));
    for (const { repositoryId } of rows) {
      try {
        const r = await refreshAdvisoriesForRepository(repositoryId);
        if (r) console.log(`[worker] advisory refresh ${repositoryId}: ${r.checked} versions checked, ${r.newAdvisories} new advisories`);
      } catch (e) {
        console.error(`[worker] advisory refresh failed for ${repositoryId}`, e instanceof Error ? e.message : e);
      }
    }
  },
};

let stopping = false;
let running = 0;
let lastPollAt = Date.now();

async function execute(job: ClaimedJob) {
  const handler = handlers[job.type];
  const started = Date.now();
  console.log(`[worker] start ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
  try {
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`Job timed out after ${job.timeoutSeconds}s`), { timeout: true })), job.timeoutSeconds * 1000);
    });
    try {
      await Promise.race([handler(job.payload, job), timeout]);
    } finally {
      clearTimeout(timer!);
    }
    await completeJob(job);
    console.log(`[worker] done  ${job.type} ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    const { dead } = await failJob(job, e, (e as { timeout?: boolean }).timeout ? "timeout" : "failed");
    console.error(`[worker] ${dead ? "DEAD" : "retry"} ${job.type} ${job.id}: ${e instanceof Error ? e.message : e}`);
  }
}

async function loop() {
  while (!stopping) {
    lastPollAt = Date.now();
    try {
      if (running < CONCURRENCY) {
        const job = await claimJob(workerId);
        if (job) {
          running++;
          void execute(job).finally(() => running--);
          continue; // try to fill remaining slots immediately
        }
      }
    } catch (e) {
      console.error("[worker] poll error", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Maintenance: recover jobs from crashed workers; schedule periodic advisory refreshes.
setInterval(() => void reapStaleJobs().catch((e) => console.error("[worker] reaper", e)), 60_000);
const refreshMinutes = Number(process.env.ADVISORY_REFRESH_MINUTES ?? 360);
setInterval(() => void enqueue({ type: "advisory.refresh", payload: {}, dedupeKey: "advisory-refresh", timeoutSeconds: 1800, maxAttempts: 2 }).catch(() => {}), refreshMinutes * 60_000);

const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
Bun.serve({
  port: healthPort,
  fetch: async () => {
    const stale = Date.now() - lastPollAt > 30_000;
    return Response.json({ status: stale ? "stale" : "ok", workerId, running, concurrency: CONCURRENCY, lastPollAt: new Date(lastPollAt).toISOString(), queue: await queueStats().catch(() => []) }, { status: stale ? 503 : 200 });
  },
});

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: finishing ${running} running job(s)…`);
  const deadline = Date.now() + 30_000;
  while (running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  process.exit(running > 0 ? 1 : 0); // unfinished jobs are re-queued by the stale-lock reaper
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`[worker] ${workerId} started (concurrency ${CONCURRENCY}, health :${healthPort})`);
await reapStaleJobs().catch(() => {});
void sql;
await loop();
