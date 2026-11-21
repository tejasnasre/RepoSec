"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotificationActions } from "@/lib/use-api";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const { markAllRead } = useNotificationActions();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => start(async () => { await markAllRead(); })}>
      {pending ? <Spinner data-icon="inline-start" /> : <CheckCheck data-icon="inline-start" />}Mark all read
    </Button>
  );
}
