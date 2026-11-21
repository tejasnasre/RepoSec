import "server-only";
import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";

/** Server-side API call that forwards the browser's session cookie. Never cached. */
export async function serverApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const headers = new Headers(init.headers);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return apiFetch<T>(path, { cache: "no-store", ...init, headers });
}
