import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabels } from "@/lib/format";

const sev: Record<string, string> = {
  critical: "bg-red-600 text-white border-transparent",
  high: "bg-orange-500 text-white border-transparent",
  medium: "bg-amber-400 text-amber-950 border-transparent",
  low: "bg-sky-500 text-white border-transparent",
  informational: "bg-muted text-muted-foreground border-transparent",
  unknown: "bg-muted text-muted-foreground border-transparent",
  info: "bg-muted text-muted-foreground border-transparent",
};

export function SeverityBadge({ severity, className, count }: { severity: string; className?: string; count?: number }) {
  return <Badge className={cn("capitalize", sev[severity] ?? sev.unknown, className)}>{count !== undefined ? `${count} ${severity}` : severity}</Badge>;
}

const tone = {
  good: "bg-emerald-600 text-white border-transparent",
  bad: "bg-red-600 text-white border-transparent",
  warn: "bg-amber-400 text-amber-950 border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-sky-600 text-white border-transparent",
};
export function Pill({ t = "neutral", children, className }: { t?: keyof typeof tone; children: React.ReactNode; className?: string }) {
  return <Badge className={cn(tone[t], className)}>{children}</Badge>;
}

export function FindingStatusBadge({ status }: { status: string }) {
  const t = status === "fix_verified" ? "good" : status === "still_vulnerable" ? "bad" : status === "fix_partially_verified" || status === "pr_merged" ? "warn" : status === "pr_created" || status === "fix_available" ? "info" : "neutral";
  return <Pill t={t}>{statusLabels[status] ?? status}</Pill>;
}

export function ReachabilityBadge({ value }: { value: string }) {
  if (value === "verified") return <Pill t="bad">Reachability verified</Pill>;
  if (value === "not_found") return <Pill t="good">No usage found</Pill>;
  return <Pill>Reachability unknown</Pill>;
}

export function AnalysisStatusBadge({ status }: { status: string }) {
  return <Pill t={status === "completed" ? "good" : status === "failed" ? "bad" : status === "running" ? "info" : "neutral"} className="capitalize">{status}</Pill>;
}
