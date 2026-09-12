"use client";

import { BarChart, Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";

export interface CategoryPerformancePoint {
  categoryId: string;
  name: string;
  netSales: number;
}

/**
 * "Category Performance" chart — net sales by category for the selected
 * global range. `data` is a server-side composition of
 * `getProductProfitability()` grouped by `categoryId` and joined with
 * `getCategories()` for names (no dedicated category-sales analytics
 * function exists; this is a presentation-level transform of an
 * already-computed analytics result, not a new calculation).
 */
export function CategoryPerformanceChart({ data }: { data: CategoryPerformancePoint[] }) {
  const sorted = [...data].sort((a, b) => b.netSales - a.netSales);

  return (
    <ChartCard title="Category Performance" description="Categories ranked by net sales.">
      {sorted.length > 0 ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} tickFormatter={(v: number) => inr(v, { compact: true })} />
              <YAxis type="category" dataKey="name" {...AXIS} width={116} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => inr(v)} />}
                cursor={{ fill: "var(--color-secondary)" }}
              />
              <Bar dataKey="netSales" name="Net Sales" radius={[0, 6, 6, 0]} barSize={16}>
                {sorted.map((entry, i) => (
                  <Cell key={entry.categoryId} fill={i === 0 ? "var(--color-chart-1)" : "var(--color-chart-5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}
