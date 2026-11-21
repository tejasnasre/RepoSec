"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchTabs } from "@/lib/use-api";

/** Warms the cache for every tab shortly after the dashboard loads (idle time, after the visible page's own requests). */
export function DashboardPrefetch() {
  const client = useQueryClient();
  useEffect(() => {
    const run = () => prefetchTabs(client);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 800);
    return () => clearTimeout(id);
  }, [client]);
  return null;
}
