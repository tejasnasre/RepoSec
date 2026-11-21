"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GitHubMark } from "@/components/github-mark";
import { authClient } from "@/lib/auth-client";

export function GitHubSignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "github",
      // Absolute URLs: the API is on a different origin than this app.
      callbackURL: `${window.location.origin}/dashboard`,
      errorCallbackURL: `${window.location.origin}/?error=auth`,
    });
    // On success the browser is redirected to GitHub; we only get here on failure.
    if (error) setPending(false);
  }

  return (
    <Button size="lg" className="h-11 gap-2 px-5 text-base" onClick={signIn} disabled={pending}>
      {pending ? <Spinner className="size-5" /> : <GitHubMark className="size-5" />}
      {pending ? "Redirecting to GitHub…" : "Continue with GitHub"}
    </Button>
  );
}
