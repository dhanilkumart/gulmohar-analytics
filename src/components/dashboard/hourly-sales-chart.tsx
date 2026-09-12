"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { HourlySales } from "@/lib/analytics";

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

/**
 * "Hourly Sales" — net sales by hour of day for the selected range, from
 * the existing `getHourlySales(range)` (already zero-filled for all 24
 * hours server-side). Highlight threshold (`> 70000`, matching Lovable's
 * fixed value) is presentation-only color emphasis, not a business rule.
 */
export function HourlySalesChart({ data }: { data: HourlySales[] }) {
  const hasData = data.some((point) => point.netSales > 0);
  const chartData = data.map((point) => ({ ...point, label: formatHourLabel(point.hour) }));

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Hourly Sales"
      description="Sales distribution across service hours."
    >
      {hasData ? (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval={1} />
              <YAxis {...AXIS} width={58} tickFormatter={(v: number) => inr(v, { compact: true })} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => inr(v)} />}
                cursor={{ fill: "var(--color-secondary)" }}
              />
              <Bar dataKey="netSales" name="Sales" radius={[6, 6, 0, 0]}>
                {chartData.map((point) => (
                  <Cell
                    key={point.hour}
                    fill={point.netSales > 70000 ? "var(--color-chart-1)" : "var(--color-chart-5)"}
                  />
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
