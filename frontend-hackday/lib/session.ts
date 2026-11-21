import "server-only";
import { cookies } from "next/headers";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  githubLogin?: string | null;
};

/**
 * Validates the session against the API (server components / actions only).
 * Forwards the browser's cookies, since the API is a different origin.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { user: SessionUser } | null;
  } catch {
    return null;
  }
}
