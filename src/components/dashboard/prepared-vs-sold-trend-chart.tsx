"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID, formatPeriodLabel } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { num } from "@/lib/format";
import type { PreparationTrendPoint } from "@/lib/analytics";

/**
 * "Prepared vs Sold by Day" — from the new `getPreparationTrend(range)`
 * (src/lib/analytics/preparation.ts), summed across the tracked
 * preparation products per period.
 */
export function PreparedVsSoldTrendChart({ data }: { data: PreparationTrendPoint[] }) {
  const hasData = data.some((point) => point.preparedQuantity > 0);

  return (
    <ChartCard title="Prepared vs Sold by Day" description="Daily preparation against sell-through.">
      {hasData ? (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="period" tickFormatter={formatPeriodLabel} {...AXIS} />
              <YAxis {...AXIS} width={52} tickFormatter={(v: number) => num(v)} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => num(v)} />}
                cursor={{ fill: "var(--color-secondary)" }}
                labelFormatter={(label) => formatPeriodLabel(String(label))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="preparedQuantity" name="Prepared" fill="var(--color-chart-5)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="soldQuantity" name="Sold" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No preparation data recorded for the selected period." />
      )}
    </ChartCard>
  );
}
