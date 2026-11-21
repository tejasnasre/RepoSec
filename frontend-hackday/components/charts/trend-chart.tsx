"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartCard, ChartEmpty, GRID_STROKE, Legend, SEVERITIES, TooltipBox } from "@/components/charts/chart-kit";
import { useChartWidth } from "@/components/charts/use-chart-width";

export type TrendPoint = { date: string; vulnerabilities: number; critical: number; high: number; medium: number; low: number };

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [ref, width] = useChartWidth();
  const first = trend[0];
  const last = trend[trend.length - 1];
  const delta = first && last ? last.vulnerabilities - first.vulnerabilities : 0;
  return (
    <ChartCard
      title="Vulnerabilities over time"
      description={trend.length > 1 ? `Last ${trend.length} days · ${delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta} since ${fmt(first!.date)}`}` : "Builds up as scans complete."}
      className="lg:col-span-2"
    >
      {trend.length < 2 ? (
        <ChartEmpty compact>The trend appears after a second day of scan history. Every completed scan is recorded, so this fills in on its own.</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={ref} className="h-56 w-full" role="img" aria-label={`Vulnerabilities by severity over the last ${trend.length} days, now ${last!.vulnerabilities}`}>
            {width > 0 && (
              <AreaChart width={width} height={224} data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmt} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={({ payload, label }) => payload?.length ? (
                  <TooltipBox title={fmt(String(label))} rows={[...SEVERITIES].reverse().map((s) => ({ label: s.label, color: s.color, value: Number((payload[0]!.payload as TrendPoint)[s.key]) }))} />
                ) : null} />
                {[...SEVERITIES].reverse().map((s) => (
                  <Area key={s.key} type="monotone" dataKey={s.key} stackId="sev" stroke={s.color} fill={s.color} fillOpacity={0.55} strokeWidth={1.5} isAnimationActive={false} />
                ))}
              </AreaChart>
            )}
          </div>
          <Legend items={SEVERITIES.map((s) => ({ label: s.label, color: s.color, value: last![s.key] }))} />
        </div>
      )}
    </ChartCard>
  );
}
