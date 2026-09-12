"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID, formatPeriodLabel } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { pct } from "@/lib/format";
import type { WastagePercentageTrendPoint } from "@/lib/analytics";

/**
 * "Wastage % Trend" — from the existing `getWastagePercentageTrend(range)`,
 * which sums prepared/wasted quantities per period FIRST and derives the
 * percentage from those sums (not an average of daily percentages) —
 * this component just renders that already-correct result.
 */
export function WastagePercentageTrendChart({ data }: { data: WastagePercentageTrendPoint[] }) {
  const hasData = data.some((point) => point.preparedQuantity > 0);

  return (
    <ChartCard title="Wastage % Trend" description="Wasted share of prepared quantity.">
      {hasData ? (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="period" tickFormatter={formatPeriodLabel} {...AXIS} />
              <YAxis {...AXIS} width={44} unit="%" />
              <Tooltip
                content={<ChartTooltip formatter={(v) => pct(v)} />}
                labelFormatter={(label) => formatPeriodLabel(String(label))}
              />
              <Line
                type="monotone"
                dataKey="wastagePercentage"
                name="Wastage %"
                stroke="var(--color-chart-2)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No preparation data recorded for the selected period." />
      )}
    </ChartCard>
  );
}
