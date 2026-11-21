"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthError } from "@/lib/use-api";

/**
 * Renders a loading skeleton only when there is nothing cached yet. With cached data it renders the
 * data immediately and lets the background refresh swap new values in.
 */
type BoundaryQuery<T> = { data: T | undefined; isError: boolean; error: unknown; refetch: () => unknown };

export function QueryBoundary<T>({
  query,
  skeleton,
  children,
}: {
  query: BoundaryQuery<T>;
  skeleton: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  const router = useRouter();
  const unauthorized = isAuthError(query.error);
  useEffect(() => {
    if (unauthorized) router.replace("/");
  }, [unauthorized, router]);

  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError && !unauthorized) {
    return (
      <div className="mx-6 my-8 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
        <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
        <h2 className="font-medium">Couldn&apos;t load this page</h2>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">{query.error instanceof Error ? query.error.message : "The API didn't respond as expected."} Check that the backend is running, then try again.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }
  return <>{skeleton}</>;
}
