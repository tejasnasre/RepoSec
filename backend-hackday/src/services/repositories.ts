import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  githubInstallations,
  githubInstallationUsers,
  githubRepositories,
  githubRepositoryMemberships,
} from "../db/schema";

/** Every repository the user may see (via an installation they proved access to), with their connect state. */
export async function listUserRepositories(userId: string) {
  const rows = await db
    .select({
      repo: githubRepositories,
      installation: {
        id: githubInstallations.id,
        accountLogin: githubInstallations.accountLogin,
        accountType: githubInstallations.accountType,
      },
      membership: {
        connectedAt: githubRepositoryMemberships.connectedAt,
        disconnectedAt: githubRepositoryMemberships.disconnectedAt,
      },
    })
    .from(githubRepositories)
    .innerJoin(githubInstallations, eq(githubRepositories.installationRowId, githubInstallations.id))
    .innerJoin(
      githubInstallationUsers,
      and(
        eq(githubInstallationUsers.installationRowId, githubInstallations.id),
        eq(githubInstallationUsers.userId, userId),
      ),
    )
    .leftJoin(
      githubRepositoryMemberships,
      and(
        eq(githubRepositoryMemberships.repositoryId, githubRepositories.id),
        eq(githubRepositoryMemberships.userId, userId),
      ),
    )
    .where(and(isNull(githubRepositories.removedAt), isNull(githubInstallations.deletedAt)))
    .orderBy(asc(githubRepositories.fullName));

  return rows.map(({ repo, installation, membership }) => ({
    id: repo.id,
    githubRepoId: repo.githubRepoId,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    description: repo.description,
    isPrivate: repo.isPrivate,
    defaultBranch: repo.defaultBranch,
    primaryLanguage: repo.primaryLanguage,
    htmlUrl: repo.htmlUrl,
    archived: repo.archived,
    installation,
    connected: membership !== null && membership.connectedAt !== null && membership.disconnectedAt === null,
    connectedAt: membership?.connectedAt ?? null,
  }));
}

/** Subset of `repositoryIds` the user is actually allowed to use. Never trust ids from the client. */
export async function filterAccessibleRepositoryIds(userId: string, repositoryIds: string[]) {
  const rows = await db
    .select({ id: githubRepositories.id })
    .from(githubRepositories)
    .innerJoin(githubInstallations, eq(githubRepositories.installationRowId, githubInstallations.id))
    .innerJoin(
      githubInstallationUsers,
      and(
        eq(githubInstallationUsers.installationRowId, githubInstallations.id),
        eq(githubInstallationUsers.userId, userId),
      ),
    )
    .where(
      and(
        inArray(githubRepositories.id, repositoryIds),
        isNull(githubRepositories.removedAt),
        isNull(githubInstallations.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}
