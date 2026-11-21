import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { env } from "../env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: "pg", schema }),

  // The Next.js app lives on another origin; allow it to call auth endpoints.
  trustedOrigins: [env.FRONTEND_URL],

  // GitHub is the only way in: no email/password, no other providers.
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      // Better Auth's GitHub provider requests read:user + user:email by default.
      mapProfileToUser: (profile) => ({ githubLogin: profile.login }),
    },
  },

  // Validate sessions from a signed cookie for a few minutes instead of hitting the database on every API call.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  user: {
    additionalFields: {
      githubLogin: { type: "string", required: false, input: false },
    },
  },

  account: {
    // GitHub access tokens are stored in the `account` table; encrypt them at rest.
    encryptOAuthTokens: true,
  },
});

export type Session = typeof auth.$Infer.Session;
