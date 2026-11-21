function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4000),

  /** Neon connection string (use the pooled one, sslmode=require). */
  DATABASE_URL: required("DATABASE_URL"),

  /** Public URL of THIS backend, e.g. http://localhost:4000 */
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),

  /** Public URL of the Next.js app, used for CORS and trusted origins. */
  FRONTEND_URL: required("FRONTEND_URL"),

  GITHUB_CLIENT_ID: required("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: required("GITHUB_CLIENT_SECRET"),

  /** GitHub App (repo access, PRs). Separate from the login OAuth app above. */
  GITHUB_APP_ID: required("GITHUB_APP_ID"),
  GITHUB_APP_SLUG: required("GITHUB_APP_SLUG"),
  GITHUB_APP_CLIENT_ID: required("GITHUB_APP_CLIENT_ID"),
  GITHUB_APP_CLIENT_SECRET: required("GITHUB_APP_CLIENT_SECRET"),
} as const;

/**
 * The App private key is read lazily so the API can boot (and everything that does not
 * touch GitHub keeps working) before the key is configured. Accepts PEM contents with
 * literal "\n" line breaks, real newlines, or a path to a .pem file.
 */
export async function getGithubAppPrivateKey(): Promise<string | null> {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) return null;
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  const file = Bun.file(raw);
  return (await file.exists()) ? (await file.text()).trim() : null;
}
