"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-6 my-8 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <h2 className="font-medium">Couldn&apos;t load this page</h2>
      <p className="max-w-md text-sm text-muted-foreground text-pretty">
        The API didn&apos;t respond as expected. Check that the backend is running, then try again.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
