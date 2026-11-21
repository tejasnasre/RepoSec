"use client";

import { useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, CircleSlash, XCircle } from "lucide-react";
import { GitHubInstallLink } from "@/components/github-install-link";
import { Pill } from "@/components/badges";
import { PreferencesForm } from "@/components/preferences-form";
import { QueryBoundary } from "@/components/query-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Installation } from "@/lib/github-types";
import { timeAgo } from "@/lib/format";
import type { Preferences } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Delivery = { id: string; subject: string; status: string; error: string | null; createdAt: string };
type Me = { id: string; name: string; email: string; image: string | null; githubLogin: string | null };

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-8 first:pt-0 last:border-b-0 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
      <div className="rounded-xl border bg-card p-5">{children}</div>
    </section>
  );
}

const deliveryMeta: Record<string, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  sent: { icon: CheckCircle2, tone: "text-emerald-600", label: "Sent" },
  failed: { icon: XCircle, tone: "text-destructive", label: "Failed" },
  skipped: { icon: CircleSlash, tone: "text-muted-foreground", label: "Not sent" },
};

const friendlyError = (e: string | null) => (!e ? null : /RESEND_API_KEY/.test(e) ? "Email provider isn't configured on the server" : e);

function Deliveries({ deliveries }: { deliveries: Delivery[] }) {
  const [all, setAll] = useState(false);
  if (deliveries.length === 0) return <p className="text-sm text-muted-foreground">No emails yet. When an alert matches your preferences it is logged here.</p>;
  const shown = all ? deliveries : deliveries.slice(0, 5);
  const counts = deliveries.reduce<Record<string, number>>((m, d) => ({ ...m, [d.status]: (m[d.status] ?? 0) + 1 }), {});
  return (
    <>
      <p className="mb-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        {Object.entries(counts).map(([s, n]) => <span key={s}>{n} {deliveryMeta[s]?.label.toLowerCase() ?? s}</span>)}
      </p>
      <ul className="divide-y text-sm">
        {shown.map((d) => {
          const m = deliveryMeta[d.status] ?? deliveryMeta.skipped!;
          const Icon = m.icon;
          return (
            <li key={d.id} className="flex items-start gap-3 py-2.5">
              <Icon className={`mt-0.5 size-4 shrink-0 ${m.tone}`} aria-label={m.label} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{d.subject}</p>
                {friendlyError(d.error) && <p className="text-xs text-muted-foreground">{friendlyError(d.error)}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
            </li>
          );
        })}
      </ul>
      {deliveries.length > 5 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>
          <ChevronDown className={`size-4 transition-transform ${all ? "rotate-180" : ""}`} data-icon="inline-start" />{all ? "Show fewer" : `Show all ${deliveries.length}`}
        </Button>
      )}
    </>
  );
}

export function SettingsView() {
  const meQ = useApi<Me>("/me");
  const installationsQ = useApi<{ installations: Installation[] }>("/github/installations");
  const prefsQ = useApi<{ preferences: Preferences }>("/notifications/preferences");
  const deliveriesQ = useApi<{ deliveries: Delivery[] }>("/notifications/deliveries");
  const queries = [meQ, installationsQ, prefsQ, deliveriesQ];
  const failed = queries.find((q) => q.isError && q.data === undefined);
  const combined = {
    data: queries.every((q) => q.data !== undefined) ? true : undefined,
    isError: !!failed,
    error: failed?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
  return (
    <QueryBoundary query={combined} skeleton={<div className="mx-auto max-w-5xl space-y-6 p-6"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-80 w-full" /></div>}>
      {() => {
        const me = meQ.data!;
        const installations = installationsQ.data!.installations;
        const preferences = prefsQ.data!.preferences;
        const deliveries = deliveriesQ.data!.deliveries;
        const notConfigured = deliveries.length > 0 && deliveries.every((d) => d.status === "skipped" && /RESEND_API_KEY/.test(d.error ?? ""));
        return (
          <div className="mx-auto max-w-5xl p-6">
            <Section title="Account" description="You sign in with GitHub. Your login is only used to identify you.">
              <div className="flex items-center gap-4">
                {me.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.image} alt="" className="size-12 rounded-full" />
                ) : <div className="size-12 rounded-full bg-muted" />}
                <div className="min-w-0">
                  <p className="font-medium">{me.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{me.email}</p>
                  {me.githubLogin && <p className="text-xs text-muted-foreground">@{me.githubLogin} on GitHub</p>}
                </div>
              </div>
            </Section>

            <Section title="GitHub App" description="Repository access is granted per installation through the GitHub App, never through your login.">
              {installations.length === 0 ? (
                <p className="text-sm text-muted-foreground">The RepoSec GitHub App isn&apos;t installed yet.</p>
              ) : (
                <ul className="divide-y">
                  {installations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                      {i.accountAvatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.accountAvatarUrl} alt="" className="size-9 rounded-full" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">@{i.accountLogin}</p>
                        <p className="text-xs text-muted-foreground">{i.accountType} account · installation #{i.installationId}</p>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Pill t={i.repositorySelection === "all" ? "warn" : "good"}>{i.repositorySelection === "all" ? "All repositories" : "Selected repositories"}</Pill>
                        {i.suspendedAt && <Pill t="bad">Suspended</Pill>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {installations.some((i) => i.repositorySelection === "all") && (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  The app can see every repository on this account. Narrow it to the repositories you want scanned on GitHub.
                </p>
              )}
              <div className="mt-4"><GitHubInstallLink variant="outline">{installations.length ? "Manage installation on GitHub" : "Install GitHub App"}</GitHubInstallLink></div>
            </Section>

            <Section title="Email notifications" description="Choose what is worth an email. The in-app Notifications feed always keeps everything.">
              {notConfigured && (
                <p role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Email delivery isn&apos;t set up on the server yet (no email provider key), so alerts currently stay in the in-app feed. Your preferences are saved and apply as soon as it is.
                </p>
              )}
              <PreferencesForm initial={preferences} email={me.email} />
            </Section>

            <Section title="Recent email deliveries" description="The last emails RepoSec tried to send to you, and whether they went out.">
              <Deliveries deliveries={deliveries} />
            </Section>
          </div>
        );
      }}
    </QueryBoundary>
  );
}
