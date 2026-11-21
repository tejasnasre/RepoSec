"use client";

import { useSyncExternalStore } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";

/** Quiet "Updating…" hint while cached data is being refreshed in the background. */
export function FetchingIndicator() {
  const fetching = useIsFetching() > 0;
  // Only react to fetching after mount so the first client render always matches the server HTML.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const n = mounted && fetching ? 1 : 0;
  return (
    <span aria-live="polite" className={`ml-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-200 ${n > 0 ? "opacity-100" : "opacity-0"}`}>
      <Spinner className="size-3" /> Updating…
    </span>
  );
}
