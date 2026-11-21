"use client";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-kit";

export type BarItem = { label: string; value: number; color: string; note?: string };

/** Single-series comparison bars with the value printed on each row (no legend needed: the row label is the identity). */
export function BreakdownBars({ title, description, items, total, empty }: { title: string; description?: string; items: BarItem[]; total: number; empty: string }) {
  return (
    <ChartCard title={title} description={description}>
      {total === 0 ? (
        <ChartEmpty>{empty}</ChartEmpty>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {items.map((i) => (
            <li key={i.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span>{i.label}{i.note && <span className="ml-2 text-xs text-muted-foreground">{i.note}</span>}</span>
                <span className="tabular-nums"><span className="font-medium">{i.value}</span> <span className="text-xs text-muted-foreground">{Math.round((i.value / total) * 100)}%</span></span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-[4px] bg-muted" role="img" aria-label={`${i.label}: ${i.value} of ${total}`}>
                <div className="h-full rounded-[4px]" style={{ width: `${Math.max(i.value > 0 ? 2 : 0, (i.value / total) * 100)}%`, background: i.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
