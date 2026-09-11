"use client";

import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartContainerProps {
  title: string;
  height?: number;
  children: ReactElement;
}

/**
 * Reusable Recharts wrapper: a Card + a fixed-height ResponsiveContainer.
 * This is layout scaffolding only — no chart types or dashboard data are
 * wired up yet. A page passes its own Recharts chart (e.g. `<BarChart>`)
 * as `children` once real dashboard screens are built.
 */
export function ChartContainer({ title, height = 320, children }: ChartContainerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
