import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FileSearch, GitPullRequest, Lock, ShieldCheck } from "lucide-react";
import { AuthErrorNotice } from "@/components/auth-error-notice";
import { GitHubSignInButton } from "@/components/github-sign-in-button";
import { getSession } from "@/lib/session";

const steps = [
  {
    icon: FileSearch,
    title: "Investigates, not just detects",
    body: "Reads OSV, GitHub Advisories and NVD, then researches the official fix, changelog and migration guide for every affected package.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence over assumptions",
    body: "Every finding links to its sources and separates confirmed facts from inference. A version in a lockfile is not called exploitable without proof.",
  },
  {
    icon: GitPullRequest,
    title: "From finding to verified fix",
    body: "Open a remediation pull request or copy a ready-made prompt for your own coding agent, then we verify the fix on the next commit.",
  },
];

// Reads cookies, so it must live inside <Suspense> to keep the landing page prerenderable.
async function RedirectIfSignedIn() {
  if (await getSession()) redirect("/dashboard");
  return null;
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-16 sm:py-24">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>

      <p className="font-mono text-sm text-muted-foreground">repository security intelligence</p>

      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Something is wrong with a package you depend on. Are you affected?
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
        Connect your GitHub repositories and get an evidence-backed answer: what happened, whether
        your code is affected, what to change, and a verified fix.
      </p>

      <div className="mt-10 flex max-w-sm flex-col gap-4">
        <Suspense>
          <AuthErrorNotice />
        </Suspense>
        <GitHubSignInButton />
        <p className="text-sm text-muted-foreground">
          GitHub is the only sign-in method. There are no passwords to manage.
        </p>
      </div>

      <section className="mt-20 grid gap-10 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 flex gap-3 rounded-xl border p-5">
        <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="font-medium">Your code stays yours</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Repository access is granted per repository through a GitHub App with least-privilege
            permissions. Repository code is never executed on our servers, only the minimum
            necessary excerpts reach the AI, and nothing is ever merged without your review.
          </p>
        </div>
      </section>
    </main>
  );
}
