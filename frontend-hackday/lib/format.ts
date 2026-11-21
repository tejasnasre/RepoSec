export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "—");

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export const stageLabels: Record<string, string> = {
  connecting_repository: "Connecting repository",
  fetching_latest_commit: "Fetching latest commit",
  extracting_dependencies: "Extracting dependencies",
  fetching_package_metadata: "Fetching package metadata",
  checking_vulnerabilities: "Checking vulnerabilities",
  researching_advisories: "Researching security advisories",
  investigating_packages: "Investigating package changes",
  generating_report: "Generating report",
  sending_notifications: "Sending notifications",
};

export const classificationLabels: Record<string, string> = {
  known_vulnerability: "Known vulnerability",
  potentially_vulnerable: "Potentially vulnerable",
  malicious_package: "Malicious package",
  compromised_release: "Compromised release",
  deprecated_package: "Deprecated package",
  suspicious_package: "Suspicious package",
};

export const statusLabels: Record<string, string> = {
  open: "Open", investigating: "Investigating", fix_available: "Fix available", pr_created: "PR created", pr_merged: "PR merged",
  fix_verified: "Fix verified", fix_partially_verified: "Partially verified", still_vulnerable: "Still vulnerable",
  false_positive: "False positive", accepted_risk: "Accepted risk", closed: "Closed",
};

/** "Today", "Yesterday", or a short date: used to group feeds into days. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function groupByDay<T>(items: T[], at: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(at(item));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
