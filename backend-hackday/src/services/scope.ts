import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { repositoryAnalyses } from "../db/schema";
import { cached } from "../lib/cache";
import { listUserRepositories } from "./repositories";

export async function latestAnalysis(repositoryId: string, completedOnly = false) {
  const [a] = await db
    .select()
    .from(repositoryAnalyses)
    .where(and(eq(repositoryAnalyses.repositoryId, repositoryId), completedOnly ? eq(repositoryAnalyses.status, "completed") : undefined))
    .orderBy(desc(repositoryAnalyses.createdAt))
    .limit(1);
  return a ?? null;
}

type Analysis = typeof repositoryAnalyses.$inferSelect;

/** Most recent *completed* analysis for each repository, in one query instead of one per repository. */
async function latestCompletedByRepository(repositoryIds: string[]): Promise<Map<string, Analysis>> {
  if (!repositoryIds.length) return new Map();
  const rows = await db
    .selectDistinctOn([repositoryAnalyses.repositoryId])
    .from(repositoryAnalyses)
    .where(and(inArray(repositoryAnalyses.repositoryId, repositoryIds), eq(repositoryAnalyses.status, "completed")))
    .orderBy(repositoryAnalyses.repositoryId, desc(repositoryAnalyses.createdAt));
  return new Map(rows.map((a) => [a.repositoryId, a]));
}

async function loadUserScope(userId: string) {
  const repos = (await listUserRepositories(userId)).filter((r) => r.connected);
  const byRepo = await latestCompletedByRepository(repos.map((r) => r.id));
  const items = repos.map((repo) => ({ repo, analysis: byRepo.get(repo.id) ?? null }));
  return {
    repos,
    items,
    repositoryIds: repos.map((r) => r.id),
    analysisIds: items.flatMap((i) => (i.analysis ? [i.analysis.id] : [])),
  };
}

/** The user's connected repositories + each one's most recent *completed* analysis. Cached for a few seconds. */
export function userScope(userId: string) {
  return cached(`scope:${userId}`, 8_000, () => loadUserScope(userId));
}
