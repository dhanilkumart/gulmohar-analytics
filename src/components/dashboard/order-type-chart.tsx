"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { SalesByOrderType } from "@/lib/analytics";

/**
 * "Sales by Order Type" — net sales by order type, from the existing
 * `getSalesByOrderType(range)`. Groups are exactly whatever order types
 * appear in the data (e.g. "Dine-in"/"Delivery"/"Takeaway") — none are
 * hard-coded.
 */
export function OrderTypeChart({ data }: { data: SalesByOrderType[] }) {
  const sorted = [...data].sort((a, b) => b.netSales - a.netSales);

  return (
    <ChartCard title="Sales by Order Type" description="Where the revenue comes from.">
      {sorted.length > 0 ? (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="orderType" {...AXIS} />
              <YAxis {...AXIS} width={58} tickFormatter={(v: number) => inr(v, { compact: true })} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => inr(v)} />}
                cursor={{ fill: "var(--color-secondary)" }}
              />
              <Bar dataKey="netSales" name="Net Sales" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} barSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}
