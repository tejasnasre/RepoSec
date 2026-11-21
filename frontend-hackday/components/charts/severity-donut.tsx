"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ChartCard, ChartEmpty, SEVERITIES, TooltipBox } from "@/components/charts/chart-kit";

export function SeverityDonut({ counts }: { counts: Record<string, number> }) {
  const data = SEVERITIES.map((s) => ({ ...s, value: counts[s.key] ?? 0 }));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <ChartCard title="Severity breakdown" description="Confirmed advisories in the latest scan of each repository.">
      {total === 0 ? (
        <ChartEmpty>No vulnerabilities in your latest scans.</ChartEmpty>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          <div className="relative size-44 shrink-0" role="img" aria-label={`Severity breakdown: ${data.map((d) => `${d.value} ${d.key}`).join(", ")}`}>
            <PieChart width={176} height={176}>
              <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="label" innerRadius={56} outerRadius={84} paddingAngle={2} stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                {data.filter((d) => d.value > 0).map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip content={({ payload }) => payload?.[0] ? <TooltipBox rows={[{ label: String(payload[0].name), color: (payload[0].payload as { color: string }).color, value: `${payload[0].value} (${Math.round((Number(payload[0].value) / total) * 100)}%)` }]} /> : null} />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{total}</span>
              <span className="text-xs text-muted-foreground">total</span>
            </div>
          </div>
          <div className="w-full flex-1">
            <ul className="divide-y text-sm">
              {data.map((d) => (
                <li key={d.key} className="flex items-center gap-2 py-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: d.color }} />
                  <span>{d.label}</span>
                  <span className="ml-auto font-medium tabular-nums">{d.value}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((d.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
