"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiRequestError, apiFetch } from "@/lib/api";

/** Every endpoint the dashboard tabs read. Warmed in the background so the first click on a tab is instant too. */
export const TAB_ENDPOINTS = [
  "/overview",
  "/me",
  "/repositories",
  "/github/installations",
  "/github/repositories",
  "/security/findings",
  "/security/vulnerabilities",
  "/security/investigations",
  "/remediation",
  "/activity",
  "/notifications",
  "/notifications/preferences",
  "/notifications/deliveries",
] as const;

export const queryKey = (path: string) => ["api", path] as const;
const fetcher = <T,>(path: string) => () => apiFetch<T>(path);

export function useApi<T>(path: string) {
  return useQuery({ queryKey: queryKey(path), queryFn: fetcher<T>(path) });
}

export function prefetchTabs(client: QueryClient) {
  for (const path of TAB_ENDPOINTS) {
    // Errors are ignored here on purpose: the page that needs the data will show them.
    void client.prefetchQuery({ queryKey: queryKey(path), queryFn: fetcher(path), staleTime: 60_000 }).catch(() => {});
  }
}

/** Call after any successful mutation: marks every cached query stale (visible ones refetch now) and re-renders server pages. */
export function useRefreshAll() {
  const client = useQueryClient();
  const router = useRouter();
  return useCallback(() => {
    void client.invalidateQueries();
    router.refresh();
  }, [client, router]);
}

export function isAuthError(e: unknown) {
  return e instanceof ApiRequestError && e.status === 401;
}

type NotificationsCache = { notifications: { id: string; readAt: string | null }[]; unread: number };

/** Read-state changes update the cached feed immediately (no refetch flash), then reconcile with the server. */
export function useNotificationActions() {
  const client = useQueryClient();
  const key = queryKey("/notifications");
  const patch = (match: (id: string) => boolean) =>
    client.setQueryData<NotificationsCache>(key, (old) => {
      if (!old) return old;
      const now = new Date().toISOString();
      const notifications = old.notifications.map((n) => (!n.readAt && match(n.id) ? { ...n, readAt: now } : n));
      return { ...old, notifications, unread: notifications.filter((n) => !n.readAt).length };
    });
  return {
    async markRead(id: string) {
      patch((x) => x === id);
      try { await apiFetch(`/notifications/${id}/read`, { method: "POST" }); } finally { void client.invalidateQueries({ queryKey: key }); }
    },
    async markAllRead() {
      patch(() => true);
      try { await apiFetch("/notifications/read-all", { method: "POST" }); } finally { void client.invalidateQueries({ queryKey: key }); }
    },
  };
}
