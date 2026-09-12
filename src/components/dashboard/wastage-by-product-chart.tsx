"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { WastageByProduct } from "@/lib/analytics";

/** "Wastage by Product" — highest wastage-cost contributors, from `getWastageByProduct(range)`. */
export function WastageByProductChart({ data }: { data: WastageByProduct[] }) {
  const sorted = [...data].sort((a, b) => b.wastageCost - a.wastageCost).slice(0, 8);

  return (
    <ChartCard title="Wastage by Product" description="Highest wastage cost contributors.">
      {sorted.length > 0 ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} tickFormatter={(v: number) => inr(v, { compact: true })} />
              <YAxis type="category" dataKey="productName" {...AXIS} width={110} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => inr(v)} />}
                cursor={{ fill: "var(--color-secondary)" }}
              />
              <Bar dataKey="wastageCost" name="Wastage Cost" fill="var(--color-chart-4)" radius={[0, 6, 6, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No wastage recorded for the selected period." />
      )}
    </ChartCard>
  );
}
