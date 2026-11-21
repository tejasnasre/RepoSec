"use client";

import { useState, useTransition } from "react";
import { useRefreshAll } from "@/lib/use-api";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError, apiFetch } from "@/lib/api";

export function RescanButton({ repositoryId, disabled }: { repositoryId: string; disabled?: boolean }) {
  const refreshAll = useRefreshAll();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await apiFetch(`/repositories/${repositoryId}/rescan`, { method: "POST" });
              refreshAll();
            } catch (e) {
              setError(e instanceof ApiRequestError ? e.message : "Could not start a rescan");
            }
          })
        }
      >
        {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
        {pending ? "Starting…" : "Rescan"}
      </Button>
    </div>
  );
}
