import { createAuthClient } from "better-auth/react";

// Auth lives in the standalone Elysia API, not in Next.js API routes.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  fetchOptions: { credentials: "include" },
});
