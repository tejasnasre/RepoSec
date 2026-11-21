import { ApiError } from "../errors";

const BASE = "https://api.github.com";

/** Minimal GitHub REST helper. `auth` is a full Authorization header value (Bearer/token). */
export async function ghFetch<T>(path: string, auth: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "reposec",
      ...init.headers,
      authorization: auth,
    },
  });
  if (!res.ok) {
    // Body may contain request details; log status + path only.
    console.error("[github] request failed", res.status, init.method ?? "GET", path.split("?")[0]);
    throw new ApiError(res.status === 404 ? 404 : 502, "github_error", `GitHub request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Follows `page` pagination for endpoints that wrap items in a key (e.g. `repositories`). */
export async function ghPaginate<T>(path: string, auth: string, key: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await ghFetch<Record<string, unknown>>(`${path}${sep}per_page=100&page=${page}`, auth);
    const items = (body[key] ?? []) as T[];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/** Fetches raw text (file contents, README) from the GitHub API. Returns undefined on 404/oversize. */
export async function ghText(path: string, auth: string, accept = "application/vnd.github.raw+json"): Promise<string | undefined> {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    headers: { accept, "x-github-api-version": "2022-11-28", "user-agent": "reposec", authorization: auth },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    console.error("[github] raw request failed", res.status, path.split("?")[0]);
    return undefined;
  }
  return await res.text();
}
