"use client";

import { useEffect, useState } from "react";
import { GitHubMark } from "@/components/github-mark";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Plain link on purpose: the API signs a short-lived, user-bound `state` and redirects to
 * GitHub's install page. Also used to add/remove repositories on an existing installation.
 * Shows a spinner while the browser leaves for GitHub.
 */
export function GitHubInstallLink({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const [pending, setPending] = useState(false);

  // Coming back via the browser's back button restores this page from cache; clear the spinner.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <a
      href={`${API_URL}/api/v1/github/install`}
      onClick={() => setPending(true)}
      aria-busy={pending}
      className={cn(buttonVariants({ variant }), "gap-2", pending && "pointer-events-none opacity-70")}
    >
      {pending ? <Spinner /> : <GitHubMark className="size-4" />}
      {pending ? "Opening GitHub…" : children}
    </a>
  );
}
