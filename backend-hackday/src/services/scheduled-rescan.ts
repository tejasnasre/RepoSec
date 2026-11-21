import { sql } from "drizzle-orm";
import { db } from "../db";
import { requestAnalysis } from "./analysis";

/**
 * Weekly re-scan. A repository that nobody pushes to still gets new advisories, so every Friday night
 * (in RESCAN_TIMEZONE) each connected repository whose last completed scan is older than
 * RESCAN_MIN_AGE_HOURS is analysed again. The sweep is idempotent: it can run any number of times
 * (every tick, on several workers, after a restart) and never double-queues a repository.
 */
export function rescanConfig() {
  const num = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && process.env[name] !== "" && n >= min && n <= max ? Math.floor(n) : fallback;
  };
  let timeZone = process.env.RESCAN_TIMEZONE || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    console.warn(`[rescan] invalid RESCAN_TIMEZONE "${timeZone}", falling back to UTC`);
    timeZone = "UTC";
  }
  return {
    enabled: process.env.RESCAN_ENABLED !== "false",
    timeZone,
    /** 0 = Sunday ... 5 = Friday */
    day: num("RESCAN_DAY", 5, 0, 6),
    /** Local hour (0-23) the window opens; it stays open until midnight. */
    hour: num("RESCAN_HOUR", 22, 0, 23),
    /**
     * Rescan if the last scan is older than this. Deliberately 6 days, not 7: last Friday's scan
     * finishes at ~22:05, so at 22:00 this Friday it is 6d 23h old and would be skipped for a whole
     * extra week with a 7-day threshold.
     */
    minAgeHours: num("RESCAN_MIN_AGE_HOURS", 144, 1, 24 * 60),
    /** Outside the Friday window (worker was down on Friday): still rescan anything older than this. */
    catchUpAgeHours: num("RESCAN_CATCHUP_AGE_HOURS", 192, 1, 24 * 90),
    /** Don't start another analysis for a repository that already had one this recently (covers queued, running, failed). */
    cooldownHours: num("RESCAN_COOLDOWN_HOURS", 12, 1, 24 * 7),
    maxPerSweep: num("RESCAN_MAX_PER_SWEEP", 200, 1, 5000),
    tickMinutes: num("RESCAN_TICK_MINUTES", 10, 1, 60),
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday and hour in the configured timezone (DST-safe; no manual offset maths). */
export function localTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return { weekday, hour };
}

export function inRescanWindow(now: Date, cfg = rescanConfig()) {
  const t = localTime(now, cfg.timeZone);
  return t.weekday === cfg.day && t.hour >= cfg.hour;
}

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] }).rows ?? []));

/** Read-only: which repositories are due. Exported so it can be checked without queuing anything. */
export async function findRescanCandidates(now = new Date()) {
  const cfg = rescanConfig();
  const window = inRescanWindow(now, cfg);
  const minAgeHours = window ? cfg.minAgeHours : cfg.catchUpAgeHours;
  const rows = rowsOf(
    await db.execute(sql`
      SELECT r.id AS repository_id
      FROM github_repositories r
      JOIN github_installations i ON i.id = r.installation_row_id
      WHERE r.removed_at IS NULL            -- no longer accessible to the app
        AND r.archived = false              -- read-only: nobody can act on the findings
        AND i.deleted_at IS NULL            -- app uninstalled
        AND i.suspended_at IS NULL          -- installation suspended: every API call would fail
        AND EXISTS (                        -- someone still monitors it (disconnected repos are not scanned)
          SELECT 1 FROM github_repository_memberships m WHERE m.repository_id = r.id AND m.disconnected_at IS NULL)
        AND NOT EXISTS (                    -- anything queued, running, just finished or just failed: leave it alone
          SELECT 1 FROM repository_analyses a
          WHERE a.repository_id = r.id AND a.created_at > now() - make_interval(hours => ${cfg.cooldownHours}))
        AND coalesce(                       -- never scanned successfully => treated as infinitely stale
          (SELECT max(coalesce(a.completed_at, a.created_at)) FROM repository_analyses a WHERE a.repository_id = r.id AND a.status = 'completed'),
          'epoch'::timestamptz) < now() - make_interval(hours => ${minAgeHours})
        AND (${window} OR (               -- catch-up mode skips repos that keep failing (3 in a row); Friday still retries them once
          SELECT count(*) FROM (
            SELECT a.status, a.error FROM repository_analyses a WHERE a.repository_id = r.id ORDER BY a.created_at DESC LIMIT 3
          ) last3 WHERE last3.status = 'failed' AND coalesce(last3.error, '') NOT LIKE 'Superseded%') < 3)
      ORDER BY (SELECT max(a.completed_at) FROM repository_analyses a WHERE a.repository_id = r.id AND a.status = 'completed') ASC NULLS FIRST
      LIMIT ${cfg.maxPerSweep}
    `),
  );
  return { window, candidates: rows.map((r) => String(r.repository_id)) };
}

export async function runScheduledRescan(now = new Date()) {
  const { window, candidates } = await findRescanCandidates(now);
  let queued = 0;
  for (const repositoryId of candidates) {
    try {
      await requestAnalysis(repositoryId, "scheduled");
      queued++;
    } catch (e) {
      console.error(`[rescan] could not queue ${repositoryId}`, e instanceof Error ? e.message : e);
    }
  }
  return { window, mode: window ? "friday" : "catch-up", candidates: candidates.length, queued };
}
