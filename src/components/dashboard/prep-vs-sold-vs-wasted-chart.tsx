"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, CoverageNote, EmptyState } from "@/components/dashboard/ui-kit";
import { num } from "@/lib/format";

export interface PrepVsSoldVsWastedPoint {
  productId: string;
  name: string;
  prepared: number;
  sold: number;
  wasted: number;
}

/**
 * "Prepared vs Sold vs Wasted" — per-product quantities for the selected
 * range, from `getPreparationVsSoldVsWasted()`. Scoped to the tracked
 * preparation products only (never all 60 menu products) — the
 * `CoverageNote` footer states this explicitly.
 */
export function PrepVsSoldVsWastedChart({ data }: { data: PrepVsSoldVsWastedPoint[] }) {
  return (
    <ChartCard
      title="Prepared vs Sold vs Wasted"
      description="Tracked preparation items across the selected period."
      footer={
        <CoverageNote>
          Covers tracked preparation items only, not every restaurant product.
        </CoverageNote>
      }
    >
      {data.length > 0 ? (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} interval={0} angle={-18} height={54} textAnchor="end" />
              <YAxis {...AXIS} width={52} tickFormatter={(v: number) => num(v)} />
              <Tooltip content={<ChartTooltip formatter={(v) => num(v)} />} cursor={{ fill: "var(--color-secondary)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="prepared" name="Prepared" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sold" name="Sold" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="wasted" name="Wasted" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No preparation data recorded for the selected period." />
      )}
    </ChartCard>
  );
}
