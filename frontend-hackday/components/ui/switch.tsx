"use client";

import { cn } from "cn";

/** Accessible on/off switch (role="switch"). Pair with a visible label via `aria-labelledby` or `aria-label`. */
export function Switch({ checked, onChange, disabled, ...aria }: {
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; "aria-label"?: string; "aria-labelledby"?: string; "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-emerald-600" : "bg-foreground/20",
      )}
      {...aria}
    >
      <span className={cn("pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
