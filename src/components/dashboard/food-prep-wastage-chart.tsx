"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { EmptyState } from "@/components/dashboard/ui-kit";
import { num } from "@/lib/format";

export interface PreparationChartPoint {
  productId: string;
  name: string;
  prepared: number;
  sold: number;
  wasted: number;
}

/**
 * Prepared/Sold/Wasted bar chart for the tracked preparation products.
 * `data` is a server-side join of `getPreparationVsSoldVsWasted()` with
 * product names (via `getProducts()`).
 */
export function FoodPrepWastageChart({ data }: { data: PreparationChartPoint[] }) {
  if (data.length === 0) {
    return <EmptyState message="No preparation data recorded for the selected period." />;
  }

  return (
    <div className="h-[260px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="name" {...AXIS} interval={0} height={40} />
          <YAxis {...AXIS} width={46} tickFormatter={(v: number) => num(v)} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => num(v)} />}
            cursor={{ fill: "var(--color-secondary)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }} />
          <Bar dataKey="prepared" name="Prepared" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="sold" name="Sold" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="wasted" name="Wasted" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
