"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID, formatPeriodLabel } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { WastageTrendPoint } from "@/lib/analytics";

/** "Wastage Trend" — wastage cost by period, from the existing `getWastageTrend(range)`. */
export function WastageTrendChart({ data }: { data: WastageTrendPoint[] }) {
  const hasData = data.some((point) => point.wastageCost > 0);

  return (
    <ChartCard title="Wastage Trend" description="Wastage cost by day.">
      {hasData ? (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="period" tickFormatter={formatPeriodLabel} {...AXIS} />
              <YAxis {...AXIS} width={56} tickFormatter={(v: number) => inr(v, { compact: true })} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => inr(v)} />}
                labelFormatter={(label) => formatPeriodLabel(String(label))}
              />
              <Line
                type="monotone"
                dataKey="wastageCost"
                name="Wastage Cost"
                stroke="var(--color-chart-4)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No wastage recorded for the selected period." />
      )}
    </ChartCard>
  );
}
