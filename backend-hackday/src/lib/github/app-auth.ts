import { createSign } from "node:crypto";
import { env, getGithubAppPrivateKey } from "../../env";
import { ApiError } from "../errors";

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** Short-lived JWT that authenticates us *as the GitHub App* (not as an installation). */
export async function createAppJwt(): Promise<string> {
  const key = await getGithubAppPrivateKey();
  if (!key) {
    throw new ApiError(503, "github_app_not_configured", "GitHub App private key is not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat backdated 60s for clock drift; GitHub allows at most 10 minutes of lifetime.
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: env.GITHUB_APP_ID }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

type CachedToken = { token: string; expiresAt: number };
const installationTokens = new Map<number, CachedToken>();

/**
 * Installation access token (1 hour). Cached in memory until 2 minutes before expiry.
 * Never log or return this value; it grants access to the user's private repositories.
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokens.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 2 * 60_000) return cached.token;

  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await createAppJwt()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "reposec",
    },
  });
  if (!res.ok) {
    console.error("[github] installation token failed", res.status, installationId);
    throw new ApiError(502, "github_error", "Could not authenticate with GitHub for this installation");
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  installationTokens.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) });
  return body.token;
}
