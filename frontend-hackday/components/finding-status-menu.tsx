"use client";

import { useState, useTransition } from "react";
import { useRefreshAll } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";

const options = [["open", "Reopen"], ["false_positive", "Mark false positive"], ["accepted_risk", "Accept risk"], ["closed", "Close"]] as const;

export function FindingStatusMenu({ id, current }: { id: string; current: string }) {
  const refreshAll = useRefreshAll();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.filter(([v]) => v !== current).map(([value, label]) => (
        <Button key={value} size="sm" variant="outline" disabled={pending}
          onClick={() => start(async () => { setError(null); try { await apiFetch(`/security/findings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: value }) }); refreshAll(); } catch { setError("Couldn't update the status"); } })}>
          {pending && <Spinner data-icon="inline-start" />}{label}
        </Button>
      ))}
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
