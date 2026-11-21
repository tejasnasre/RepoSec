"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiRequestError } from "@/lib/api";

/**
 * Client-side cache for every dashboard list page (stale-while-revalidate):
 *  - revisiting a tab shows the cached data instantly and refreshes it quietly in the background
 *  - data is kept for 30 minutes, so the cache survives hopping between tabs all day
 *  - mutations call `useRefreshAll()` so changes are never hidden behind the cache
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
