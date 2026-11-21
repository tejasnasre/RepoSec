import { and, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "../db";
import { githubInstallations, githubInstallationUsers, githubRepositories } from "../db/schema";
import { ghFetch, ghPaginate } from "../lib/github/api";
import { createAppJwt, getInstallationToken } from "../lib/github/app-auth";

type GhInstallation = {
  id: number;
  account: { id: number; login: string; type: "User" | "Organization"; avatar_url?: string };
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at: string | null;
};

type GhRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  html_url: string;
  archived: boolean;
};

/** Fetches the installation from GitHub (as the App) and upserts it. Returns our row id. */
export async function upsertInstallation(installationId: number): Promise<string> {
  const gh = await ghFetch<GhInstallation>(`/app/installations/${installationId}`, `Bearer ${await createAppJwt()}`);
  const values = {
    installationId: gh.id,
    accountId: gh.account.id,
    accountLogin: gh.account.login,
    accountType: gh.account.type,
    accountAvatarUrl: gh.account.avatar_url ?? null,
    repositorySelection: gh.repository_selection,
    permissions: gh.permissions,
    suspendedAt: gh.suspended_at ? new Date(gh.suspended_at) : null,
    deletedAt: null,
  };
  const [row] = await db
    .insert(githubInstallations)
    .values(values)
    .onConflictDoUpdate({ target: githubInstallations.installationId, set: values })
    .returning({ id: githubInstallations.id });
  return row!.id;
}

/** Mirrors the repositories the installation can currently see; marks vanished ones as removed. */
export async function syncInstallationRepositories(installationRowId: string, installationId: number) {
  const token = await getInstallationToken(installationId);
  const repos = await ghPaginate<GhRepo>("/installation/repositories", `Bearer ${token}`, "repositories");

  await db.transaction(async (tx) => {
    for (const r of repos) {
      const values = {
        installationRowId,
        githubRepoId: r.id,
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        isPrivate: r.private,
        defaultBranch: r.default_branch,
        primaryLanguage: r.language,
        htmlUrl: r.html_url,
        archived: r.archived,
        removedAt: null,
      };
      await tx
        .insert(githubRepositories)
        .values(values)
        .onConflictDoUpdate({
          target: [githubRepositories.installationRowId, githubRepositories.githubRepoId],
          set: values,
        });
    }

    const liveIds = repos.map((r) => r.id);
    await tx
      .update(githubRepositories)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(githubRepositories.installationRowId, installationRowId),
          isNull(githubRepositories.removedAt),
          liveIds.length ? notInArray(githubRepositories.githubRepoId, liveIds) : undefined,
        ),
      );
  });

  return repos.length;
}

/** Records that this app user may use this installation (call only after ownership is proven). */
export async function linkUserToInstallation(userId: string, installationRowId: string) {
  await db.insert(githubInstallationUsers).values({ userId, installationRowId }).onConflictDoNothing();
}
