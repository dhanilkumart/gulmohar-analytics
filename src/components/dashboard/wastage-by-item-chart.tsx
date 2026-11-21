"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inr, num } from "@/lib/format";
import type { ItemPreparationWastageMetric } from "@/lib/analytics/live-wastage-prep";

export function WastageByItemChart({ data }: { data: ItemPreparationWastageMetric[] }) {
  const chartData = data
    .filter((d) => d.wastedQuantity > 0 || d.wastageCost > 0)
    .slice(0, 10);

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Wastage by Item</CardTitle>
          <CardDescription>Top preparation items contributing to kitchen loss</CardDescription>
        </CardHeader>
        <CardContent className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No wastage records recorded for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Wastage by Item</CardTitle>
        <CardDescription>Top preparation items contributing to kitchen loss</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `₹${v}`} className="text-xs" tickLine={false} />
              <YAxis dataKey="name" type="category" className="text-xs" tickLine={false} width={120} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as ItemPreparationWastageMetric;
                  return (
                    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                      <p className="font-semibold">{item.name} ({item.itemCode})</p>
                      <p className="text-muted-foreground">Wasted Qty: <span className="font-medium text-foreground">{num(item.wastedQuantity)} {item.unit}</span></p>
                      <p className="text-muted-foreground">Wastage Cost: <span className="font-medium text-foreground">{inr(item.wastageCost)}</span></p>
                      <p className="text-muted-foreground">Wastage Rate: <span className="font-medium text-foreground">{item.wastagePercentage.toFixed(1)}%</span></p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
              <Bar dataKey="wastageCost" name="Wastage Cost (₹)" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

