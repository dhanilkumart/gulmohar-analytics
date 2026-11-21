"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { num } from "@/lib/format";
import type { ItemPreparationWastageMetric } from "@/lib/analytics/live-wastage-prep";

export function PrepVsWastedChart({ data }: { data: ItemPreparationWastageMetric[] }) {
  const chartData = data
    .filter((d) => d.preparedQuantity > 0 || d.wastedQuantity > 0)
    .slice(0, 10);

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Prepared vs Wasted Batches</CardTitle>
          <CardDescription>Comparison of kitchen batch preparation against logged waste</CardDescription>
        </CardHeader>
        <CardContent className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No preparation or wastage records recorded for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Prepared vs Wasted Batches</CardTitle>
        <CardDescription>Comparison of kitchen batch preparation against logged waste (Top Items)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" tickLine={false} />
              <YAxis className="text-xs" tickLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as ItemPreparationWastageMetric;
                  return (
                    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                      <p className="font-semibold">{item.name} ({item.itemCode})</p>
                      <p className="text-muted-foreground">Prepared: <span className="font-medium text-foreground">{num(item.preparedQuantity)} {item.unit}</span></p>
                      <p className="text-muted-foreground">Wasted: <span className="font-medium text-foreground">{num(item.wastedQuantity)} {item.unit}</span></p>
                      <p className="text-muted-foreground">Remaining: <span className="font-medium text-foreground">{num(item.remainingQuantity)} {item.unit}</span></p>
                      <p className="text-muted-foreground">Wastage %: <span className="font-medium text-foreground">{item.wastagePercentage.toFixed(1)}%</span></p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
              <Bar dataKey="preparedQuantity" name="Prepared Qty" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.9} />
              <Bar dataKey="wastedQuantity" name="Wasted Qty" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

