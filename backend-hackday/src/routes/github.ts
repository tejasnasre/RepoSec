import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { githubInstallations, githubInstallationUsers } from "../db/schema";
import { env } from "../env";
import { auth } from "../lib/auth";
import { ApiError } from "../lib/errors";
import { ghPaginate } from "../lib/github/api";
import { createInstallState, verifyInstallState } from "../lib/github/state";
import { authPlugin } from "../plugins/auth";
import { listUserRepositories } from "../services/repositories";
import {
  linkUserToInstallation,
  syncInstallationRepositories,
  upsertInstallation,
} from "../services/github-sync";

const CALLBACK_URL = `${env.BETTER_AUTH_URL}/api/v1/github/installations/callback`;
const REPOS_PAGE = `${env.FRONTEND_URL}/dashboard/repositories`;

async function userInstallations(userId: string) {
  return db
    .select({
      id: githubInstallations.id,
      installationId: githubInstallations.installationId,
      accountLogin: githubInstallations.accountLogin,
      accountType: githubInstallations.accountType,
      accountAvatarUrl: githubInstallations.accountAvatarUrl,
      repositorySelection: githubInstallations.repositorySelection,
      suspendedAt: githubInstallations.suspendedAt,
    })
    .from(githubInstallations)
    .innerJoin(
      githubInstallationUsers,
      and(
        eq(githubInstallationUsers.installationRowId, githubInstallations.id),
        eq(githubInstallationUsers.userId, userId),
      ),
    )
    .where(isNull(githubInstallations.deletedAt));
}

export const githubRoutes = new Elysia({ prefix: "/github" })
  .use(authPlugin)

  /** Browser navigates here; we bounce to GitHub's install page with a signed, user-bound state. */
  .get(
    "/install",
    ({ user, redirect }) =>
      redirect(
        `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(createInstallState(user.id))}`,
      ),
    { auth: true },
  )

  /**
   * GitHub redirects the browser here after install/update (OAuth-during-install is on, so we get a `code`).
   * Ownership proof: exchange the code for the *user's* token and require that the installation is in
   * that user's own `GET /user/installations`. Without this, a guessed installation_id would be claimable.
   */
  .get(
    "/installations/callback",
    async ({ request, query, redirect }) => {
      const back = (params: Record<string, string>) => redirect(`${REPOS_PAGE}?${new URLSearchParams(params)}`);

      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return redirect(`${env.FRONTEND_URL}/?error=auth`);
      const userId = session.user.id;

      // Org member requested the install; an owner still has to approve it.
      if (query.setup_action === "request") return back({ github: "pending" });

      if (!verifyInstallState(query.state, userId)) return back({ github: "error", reason: "invalid_state" });

      const installationId = Number(query.installation_id);
      if (!query.code || !Number.isSafeInteger(installationId)) {
        return back({ github: "error", reason: "missing_params" });
      }

      try {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({
            client_id: env.GITHUB_APP_CLIENT_ID,
            client_secret: env.GITHUB_APP_CLIENT_SECRET,
            code: query.code,
            redirect_uri: CALLBACK_URL,
          }),
        });
        const tokenBody = (await tokenRes.json()) as { access_token?: string };
        if (!tokenBody.access_token) return back({ github: "error", reason: "oauth_exchange_failed" });

        // The user token is used for this one check and then discarded; we do not store it.
        const mine = await ghPaginate<{ id: number }>(
          "/user/installations",
          `Bearer ${tokenBody.access_token}`,
          "installations",
        );
        if (!mine.some((i) => i.id === installationId)) return back({ github: "error", reason: "not_your_installation" });

        const rowId = await upsertInstallation(installationId);
        await linkUserToInstallation(userId, rowId);
        await syncInstallationRepositories(rowId, installationId);
        return back({ github: "connected" });
      } catch (error) {
        console.error("[github] installation callback failed", error instanceof Error ? error.message : error);
        return back({ github: "error", reason: error instanceof ApiError ? error.code : "unknown" });
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        installation_id: t.Optional(t.String()),
        setup_action: t.Optional(t.String()),
        state: t.Optional(t.String()),
      }),
    },
  )

  .get("/installations", async ({ user }) => ({ installations: await userInstallations(user.id) }), { auth: true })

  /** All repositories visible through the user's installations, with connect state. */
  .get("/repositories", async ({ user }) => ({ repositories: await listUserRepositories(user.id) }), { auth: true })

  /** Re-reads installations and repositories from GitHub (after changing repo selection on GitHub). */
  .post(
    "/sync",
    async ({ user }) => {
      const installs = await userInstallations(user.id);
      let repositories = 0;
      for (const i of installs) {
        await upsertInstallation(i.installationId);
        repositories += await syncInstallationRepositories(i.id, i.installationId);
      }
      return { installations: installs.length, repositories };
    },
    { auth: true },
  );
