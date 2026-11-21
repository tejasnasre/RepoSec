import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  emailDeliveryLogs,
  githubInstallationUsers,
  githubRepositories,
  githubRepositoryMemberships,
  notificationPreferences,
  notifications,
  user,
} from "../db/schema";
import { env } from "../env";
import { enqueue } from "../lib/queue";
import { escapeHtml } from "./email";

export type NotifyInput = {
  kind: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  body: string;
  /** Frontend path, e.g. /dashboard/investigations/123 */
  path?: string;
  repositoryId: string;
  /** Same event => same key => one notification per user. */
  dedupeKey: string;
  category: "analysis" | "remediation" | "ci";
};

const sevRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 } as const;

export async function getPreferences(userId: string) {
  const [existing] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(notificationPreferences).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)))[0]!;
}

/** Users who connected this repository (and still have it connected). */
export async function repositoryMembers(repositoryId: string) {
  const rows = await db
    .select({ userId: githubRepositoryMemberships.userId })
    .from(githubRepositoryMemberships)
    .where(and(eq(githubRepositoryMemberships.repositoryId, repositoryId)));
  return rows.map((r) => r.userId);
}

export async function notifyRepository(input: NotifyInput) {
  const members = await repositoryMembers(input.repositoryId);
  for (const userId of members) await notifyUser(userId, input);
}

async function notifyUser(userId: string, input: NotifyInput) {
  const [n] = await db
    .insert(notifications)
    .values({
      userId,
      kind: input.kind,
      severity: input.severity ?? "info",
      title: input.title,
      body: input.body,
      link: input.path ? `${env.FRONTEND_URL}${input.path}` : null,
      repositoryId: input.repositoryId,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing()
    .returning();
  if (!n) return; // duplicate event: already notified

  const prefs = await getPreferences(userId);
  const allowed =
    prefs.emailEnabled &&
    (input.category === "analysis" ? prefs.analysisCompleted : input.category === "remediation" ? prefs.remediationEvents : prefs.ciEvents);
  const sev = input.severity ?? "info";
  const meetsSeverity = sev === "info" || sevRank[sev] >= sevRank[prefs.minSeverity];
  if (!allowed || !meetsSeverity) return;
  // Low-priority items are batched into the in-app feed instead of one email each.
  if (prefs.digestLowPriority && (sev === "low" || sev === "info") && input.kind !== "analysis_completed") return;

  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!u) return;
  const [log] = await db
    .insert(emailDeliveryLogs)
    .values({ notificationId: n.id, userId, toEmail: u.email, subject: input.title, meta: { kind: input.kind } })
    .returning();
  await enqueue({
    type: "notification.email.send",
    payload: { logId: log!.id, to: u.email, subject: `[RepoSec] ${input.title}`, html: renderEmail(input, n.link) },
    dedupeKey: `email:${log!.id}`,
    maxAttempts: 5,
    timeoutSeconds: 60,
  });
}

function renderEmail(input: NotifyInput, link: string | null) {
  const body = escapeHtml(input.body).replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">${escapeHtml(input.title)}</h2>
  <p style="line-height:1.5">${body}</p>
  ${link ? `<p><a href="${escapeHtml(link)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">View full report</a></p>` : ""}
  <p style="color:#666;font-size:12px">You receive this because you connected this repository to RepoSec. Change this in Settings → Notifications.</p></div>`;
}

export async function usersWithInstallation(installationRowId: string) {
  const rows = await db.select({ userId: githubInstallationUsers.userId }).from(githubInstallationUsers).where(eq(githubInstallationUsers.installationRowId, installationRowId));
  return rows.map((r) => r.userId);
}

export async function repositoryName(repositoryId: string) {
  const [r] = await db.select({ fullName: githubRepositories.fullName }).from(githubRepositories).where(eq(githubRepositories.id, repositoryId));
  return r?.fullName ?? "repository";
}

void inArray;
