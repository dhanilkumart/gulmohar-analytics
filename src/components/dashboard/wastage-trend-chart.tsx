"use client";

import { useId } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inr, num } from "@/lib/format";
import type { WastageTrendPoint } from "@/lib/analytics/live-wastage-prep";

export function WastageTrendChart({ data }: { data: WastageTrendPoint[] }) {
  const chartId = useId();

  if (!data || data.length === 0 || data.every((d) => d.wastageCost === 0 && d.wastedQuantity === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Wastage Trend</CardTitle>
          <CardDescription>Daily wastage cost and quantity over time</CardDescription>
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
        <CardTitle className="text-base font-semibold">Wastage Trend</CardTitle>
        <CardDescription>Daily wastage cost and quantity over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="period" className="text-xs" tickLine={false} />
              <YAxis
                yAxisId="cost"
                orientation="left"
                tickFormatter={(v) => `₹${v}`}
                className="text-xs"
                tickLine={false}
              />
              <YAxis
                yAxisId="qty"
                orientation="right"
                tickFormatter={(v) => `${v}`}
                className="text-xs"
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as WastageTrendPoint;
                  return (
                    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                      <p className="font-semibold">{item.period}</p>
                      <p className="text-muted-foreground">Wastage Cost: <span className="font-medium text-foreground">{inr(item.wastageCost)}</span></p>
                      <p className="text-muted-foreground">Wasted Qty: <span className="font-medium text-foreground">{num(item.wastedQuantity)}</span></p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
              <Bar yAxisId="cost" dataKey="wastageCost" name="Wastage Cost (₹)" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Line yAxisId="qty" type="monotone" dataKey="wastedQuantity" name="Wasted Quantity" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
