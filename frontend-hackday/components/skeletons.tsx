import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches the KPI row and chart grid on the overview page. */
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} size="sm" className="gap-2 px-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-36" /></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className={i === 2 ? "lg:col-span-2" : undefined}><CardHeader className="gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64" /></CardHeader><div className="px-4"><Skeleton className="h-44 w-full" /></div></Card>
        ))}
      </div>
    </div>
  );
}

/** Matches the stat tile grid (kept for the repository detail page). */
export function StatGridSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading statistics">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} size="sm">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-14" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/** Matches the toolbar + rows of the repository list. */
export function RepositoryListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Loading repositories">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <ul className="divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-3/4 max-w-md" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-8 w-24 rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}
