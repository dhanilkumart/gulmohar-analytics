"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { BreakageByItem } from "@/lib/analytics";

/**
 * "Breakage by Item" — from the existing `getBreakageByItem(range)`.
 * `item` is free text (not a `products.json` foreign key) — see the
 * type-level note on `Breakage.item` / `BreakageByItem.item`.
 */
export function BreakageByItemChart({ data }: { data: BreakageByItem[] }) {
  const sorted = [...data].sort((a, b) => b.breakageCost - a.breakageCost);

  return (
    <ChartCard title="Breakage by Item" description="Highest-cost broken items (free-text entries).">
      {sorted.length > 0 ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" tickFormatter={(v: number) => inr(v, { compact: true })} {...AXIS} />
              <YAxis type="category" dataKey="item" {...AXIS} width={130} />
              <Tooltip content={<ChartTooltip formatter={(v) => inr(v)} />} cursor={{ fill: "var(--color-secondary)" }} />
              <Bar dataKey="breakageCost" name="Breakage Cost" fill="var(--color-chart-2)" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No breakage recorded for the selected period." />
      )}
    </ChartCard>
  );
}
