"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Severity is a status scale, so it keeps the same hues as the severity badges across the app. */
export const SEVERITIES = [
  { key: "critical", label: "Critical", color: "#dc2626" },
  { key: "high", label: "High", color: "#f97316" },
  { key: "medium", label: "Medium", color: "#fbbf24" },
  { key: "low", label: "Low", color: "#0ea5e9" },
] as const;

export type SeverityKey = (typeof SEVERITIES)[number]["key"];

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
export const GRID_STROKE = "var(--border)";

export function ChartCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}

/** Legend that doubles as a table of values, so color is never the only carrier of meaning. */
export function Legend({ items }: { items: { label: string; color: string; value?: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          <span className="text-muted-foreground">{i.label}</span>
          {i.value !== undefined && <span className="font-medium tabular-nums">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function TooltipBox({ title, rows }: { title?: string; rows: { label: string; color?: string; value: number | string }[] }) {
  return (
    <div className="min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <p className="mb-1.5 font-medium">{title}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color && <Swatch color={r.color} />}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartEmpty({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <div className={`flex ${compact ? "h-24" : "h-48"} items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground text-pretty`}>{children}</div>;
}
