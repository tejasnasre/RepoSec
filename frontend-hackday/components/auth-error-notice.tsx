"use client";

import { useSearchParams } from "next/navigation";

export function AuthErrorNotice() {
  const error = useSearchParams().get("error");
  if (!error) return null;

  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      GitHub sign-in didn&apos;t complete. Please try again.
    </p>
  );
}
