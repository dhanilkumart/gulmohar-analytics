"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inr, num } from "@/lib/format";
import type { WastageByReasonPoint } from "@/lib/analytics/live-wastage-prep";

export function WastageByReasonChart({ data }: { data: WastageByReasonPoint[] }) {
  if (!data || data.length === 0 || data.every((d) => d.wastedQuantity === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Wastage by Reason</CardTitle>
          <CardDescription>Breakdown of recorded waste by operational cause</CardDescription>
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
        <CardTitle className="text-base font-semibold">Wastage by Reason</CardTitle>
        <CardDescription>Breakdown of recorded waste by operational cause</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" className="text-xs" tickLine={false} />
              <YAxis dataKey="reason" type="category" className="text-xs" tickLine={false} width={120} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as WastageByReasonPoint;
                  return (
                    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                      <p className="font-semibold">{item.reason}</p>
                      <p className="text-muted-foreground">Wasted Qty: <span className="font-medium text-foreground">{num(item.wastedQuantity)}</span></p>
                      <p className="text-muted-foreground">Estimated Cost: <span className="font-medium text-foreground">{inr(item.wastageCost)}</span></p>
                      <p className="text-muted-foreground">Share of Cost: <span className="font-medium text-foreground">{item.percentageOfTotal.toFixed(1)}%</span></p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
              <Bar dataKey="wastedQuantity" name="Wasted Quantity" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
