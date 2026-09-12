"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AXIS, ChartTooltip, GRID, formatPeriodLabel } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";

export interface SalesPerformancePoint {
  period: string;
  netSales: number;
  orderCount: number;
}

/**
 * "Sales Performance" chart — Net Sales / Orders toggle over the
 * selected global range. Data is pre-computed server-side (merged from
 * `getSalesTrend`/`getOrdersTrend`); this component only owns the
 * client-only toggle state and chart rendering.
 */
export function SalesPerformanceChart({ data }: { data: SalesPerformancePoint[] }) {
  const [metric, setMetric] = useState<"netSales" | "orderCount">("netSales");
  const hasData = data.some((point) => point.netSales > 0 || point.orderCount > 0);

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Sales Performance"
      description="Sales trend across the selected period."
      action={
        <div className="bg-secondary inline-flex rounded-xl p-1">
          {(["netSales", "orderCount"] as const).map((key) => (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              onClick={() => setMetric(key)}
              className={
                "h-8 rounded-lg px-3 text-xs font-semibold shadow-none " +
                (metric === key
                  ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {key === "netSales" ? "Net Sales" : "Orders"}
            </Button>
          ))}
        </div>
      }
    >
      {hasData ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="period" tickFormatter={formatPeriodLabel} {...AXIS} />
              <YAxis
                {...AXIS}
                width={58}
                tickFormatter={(v: number) => (metric === "netSales" ? inr(v, { compact: true }) : num(v))}
              />
              <Tooltip
                content={
                  <ChartTooltip formatter={(v) => (metric === "netSales" ? inr(v) : num(v))} />
                }
                cursor={{ stroke: "var(--color-border)" }}
                labelFormatter={(label) => formatPeriodLabel(String(label))}
              />
              <Line
                type="monotone"
                dataKey={metric}
                name={metric === "netSales" ? "Net Sales" : "Orders"}
                stroke="var(--color-chart-1)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--color-chart-1)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No sales recorded for the selected period." />
      )}
    </ChartCard>
  );
}
