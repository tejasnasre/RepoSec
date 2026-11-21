"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MarkAllRead } from "@/components/mark-all-read";
import { SeverityBadge } from "@/components/badges";
import { QueryBoundary } from "@/components/query-boundary";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { groupByDay, timeAgo, timeOfDay } from "@/lib/format";
import type { NotificationRow } from "@/lib/types";
import { useApi, useNotificationActions } from "@/lib/use-api";

const accent: Record<string, string> = {
  critical: "border-l-red-600", high: "border-l-orange-500", medium: "border-l-amber-400", low: "border-l-sky-500", info: "border-l-border",
};

const filters = [
  ["all", "All", () => true],
  ["unread", "Unread", (n: NotificationRow) => !n.readAt],
  ["urgent", "Critical & high", (n: NotificationRow) => n.severity === "critical" || n.severity === "high"],
] as const;

/** Links are stored as absolute URLs (they are also used in emails); inside the app we only need the path. */
function localPath(link: string) {
  try { const u = new URL(link, "http://x"); return `${u.pathname}${u.search}`; } catch { return link; }
}

function Item({ n }: { n: NotificationRow }) {
  const { markRead } = useNotificationActions();
  const [open, setOpen] = useState(false);
  const unread = !n.readAt;
  const title = n.title.replace(/^(CRITICAL|HIGH|MEDIUM|LOW):\s*/, "");
  const long = n.body.length > 160 || n.body.split("\n").length > 2;
  return (
    <li className={`border-l-4 p-4 text-sm ${accent[n.severity] ?? accent.info} ${unread ? "bg-muted/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {unread && <span className="size-2 rounded-full bg-sky-600" role="img" aria-label="Unread" />}
        <SeverityBadge severity={n.severity} />
        <span className={unread ? "font-semibold" : "font-medium"}>{title}</span>
        <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()} className="ml-auto text-xs text-muted-foreground">{timeAgo(n.createdAt)} · {timeOfDay(n.createdAt)}</time>
      </div>
      <p className={`mt-1.5 whitespace-pre-line text-muted-foreground ${open ? "" : "line-clamp-2"}`}>{n.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {long && (
          <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />{open ? "Show less" : "Show more"}
          </button>
        )}
        {n.link && <Link href={localPath(n.link)} onClick={() => { if (unread) void markRead(n.id); }} className="font-medium underline underline-offset-4">View</Link>}
        {unread && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void markRead(n.id)}>Mark read</button>}
      </div>
    </li>
  );
}

function Feed({ notifications, unread }: { notifications: NotificationRow[]; unread: number }) {
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  if (!notifications.length) return <EmptyState icon={Bell} title="No notifications" body="Critical and high-severity alerts, completed analyses, remediation events and CI results will appear here." />;
  const active = filters.find((f) => f[0] === filter)!;
  const visible = notifications.filter(active[2]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter notifications" className="inline-flex rounded-lg border bg-muted/50 p-0.5">
          {filters.map(([key, label, fn]) => (
            <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${filter === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label} <span className="tabular-nums text-xs opacity-70">{key === "unread" ? unread : notifications.filter(fn).length}</span>
            </button>
          ))}
        </div>
        <MarkAllRead disabled={unread === 0} />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{filter === "unread" ? "You're all caught up." : "Nothing matches this filter."}</p>
      ) : (
        groupByDay(visible, (n) => n.createdAt).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {g.items.map((n) => <Item key={n.id} n={n} />)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function NotificationsView() {
  const query = useApi<{ notifications: NotificationRow[]; unread: number }>("/notifications");
  return (
    <QueryBoundary query={query} skeleton={<RepositoryListSkeleton rows={5} />}>
      {({ notifications, unread }) => <Feed notifications={notifications} unread={unread} />}
    </QueryBoundary>
  );
}
