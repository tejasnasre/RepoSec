/**
 * Typed client for the standalone Elysia API. Safe in client and server code.
 * For server components use `serverApi` from `lib/api-server.ts` (forwards cookies).
 */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { credentials: "include", ...init, headers });
  } catch {
    throw new ApiRequestError(0, "network_error", "Could not reach the API");
  }

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as Partial<ApiErrorBody> | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "unknown_error",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return body as T;
}
